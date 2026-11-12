package assistant

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"io/fs"
	"math"
	"sort"
	"strings"
	"sync"

	"kilora/api/internal/database/sqlc"
)

//go:embed knowledge/*.md
var knowledgeFS embed.FS

// Chunk es un fragmento de la documentación de ayuda.
type Chunk struct {
	ID, Source, Title, Content string
	Embedding                  []float32
}

// LoadDocs parte cada documento de ayuda en fragmentos por sección (##).
func LoadDocs(fsys fs.FS) ([]Chunk, error) {
	paths, err := fs.Glob(fsys, "knowledge/*.md")
	if err != nil {
		return nil, err
	}
	var chunks []Chunk
	for _, p := range paths {
		data, err := fs.ReadFile(fsys, p)
		if err != nil {
			return nil, err
		}
		chunks = append(chunks, splitDoc(strings.TrimPrefix(p, "knowledge/"), string(data))...)
	}
	return chunks, nil
}

func splitDoc(source, doc string) []Chunk {
	var (
		docTitle, section string
		body              []string
		out               []Chunk
	)
	flush := func() {
		content := strings.TrimSpace(strings.Join(body, "\n"))
		body = nil
		if content == "" {
			return
		}
		title := docTitle
		if section != "" {
			title += " — " + section
		}
		out = append(out, Chunk{Source: source, Title: title, Content: content})
	}
	for _, line := range strings.Split(doc, "\n") {
		switch {
		case strings.HasPrefix(line, "# "):
			flush()
			docTitle = strings.TrimSpace(line[2:])
		case strings.HasPrefix(line, "## "):
			flush()
			section = strings.TrimSpace(line[3:])
		default:
			body = append(body, line)
		}
	}
	flush()
	return out
}

func chunkID(model string, c Chunk) string {
	sum := sha256.Sum256([]byte(model + "\x00" + c.Title + "\x00" + c.Content))
	return hex.EncodeToString(sum[:16])
}

// embedText es lo que se convierte en vector: el título da contexto a la sección.
func embedText(c Chunk) string { return c.Title + "\n\n" + c.Content }

// Knowledge mantiene la base de conocimiento: la sincroniza con Postgres
// (solo calcula embeddings de fragmentos nuevos) y busca por similitud coseno
// en memoria, suficiente para unas decenas o cientos de fragmentos.
type Knowledge struct {
	Queries *sqlc.Queries
	Client  *OpenAI

	mu     sync.Mutex
	chunks []Chunk
	loaded bool
}

func (k *Knowledge) ensure(ctx context.Context) error {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.loaded {
		return nil
	}
	docs, err := LoadDocs(knowledgeFS)
	if err != nil {
		return err
	}
	model := k.Client.EmbeddingModel
	stored, err := k.Queries.ListKnowledgeChunks(ctx, model)
	if err != nil {
		return err
	}
	have := make(map[string][]float32, len(stored))
	for _, s := range stored {
		have[s.ID] = s.Embedding
	}
	var missing []int
	keep := make([]string, len(docs))
	for i := range docs {
		docs[i].ID = chunkID(model, docs[i])
		keep[i] = docs[i].ID
		if v, ok := have[docs[i].ID]; ok {
			docs[i].Embedding = v
		} else {
			missing = append(missing, i)
		}
	}
	for start := 0; start < len(missing); start += 64 {
		batch := missing[start:min(start+64, len(missing))]
		inputs := make([]string, len(batch))
		for j, i := range batch {
			inputs[j] = embedText(docs[i])
		}
		vectors, err := k.Client.Embed(ctx, inputs)
		if err != nil {
			return err
		}
		for j, i := range batch {
			docs[i].Embedding = vectors[j]
			c := docs[i]
			if err := k.Queries.InsertKnowledgeChunk(ctx, sqlc.InsertKnowledgeChunkParams{ID: c.ID, Source: c.Source, Title: c.Title, Content: c.Content, Model: model, Embedding: c.Embedding}); err != nil {
				return err
			}
		}
	}
	if err := k.Queries.DeleteKnowledgeChunksExcept(ctx, keep); err != nil {
		return err
	}
	k.chunks, k.loaded = docs, true
	return nil
}

// Search devuelve los fragmentos más parecidos a la consulta.
func (k *Knowledge) Search(ctx context.Context, query string, limit int) ([]Chunk, error) {
	if err := k.ensure(ctx); err != nil {
		return nil, err
	}
	vectors, err := k.Client.Embed(ctx, []string{query})
	if err != nil {
		return nil, err
	}
	return topK(k.chunks, vectors[0], limit), nil
}

func topK(chunks []Chunk, query []float32, limit int) []Chunk {
	type scored struct {
		c     Chunk
		score float64
	}
	ranked := make([]scored, 0, len(chunks))
	for _, c := range chunks {
		ranked = append(ranked, scored{c, cosine(c.Embedding, query)})
	}
	sort.SliceStable(ranked, func(i, j int) bool { return ranked[i].score > ranked[j].score })
	out := make([]Chunk, 0, limit)
	for i := 0; i < len(ranked) && i < limit; i++ {
		out = append(out, ranked[i].c)
	}
	return out
}

func cosine(a, b []float32) float64 {
	if len(a) != len(b) || len(a) == 0 {
		return 0
	}
	var dot, na, nb float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}
