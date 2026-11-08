package httpserver

import (
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"kilora/api/internal/database/sqlc"
	"net/http"
	"strings"
)

func (s *server) createWorkshop(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Name       string  `json:"name"`
		NIT        *string `json:"nit"`
		BranchName string  `json:"branch_name"`
	}
	if !decode(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	in.BranchName = strings.TrimSpace(in.BranchName)
	if in.Name == "" || in.BranchName == "" {
		fail(w, 400, "Nombre de taller y sucursal son obligatorios")
		return
	}
	u := currentUser(r.Context())
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer tx.Rollback(r.Context())
	var id, bid uuid.UUID
	err = tx.QueryRow(r.Context(), `INSERT INTO workshop(name,nit) VALUES($1,$2) RETURNING id`, in.Name, in.NIT).Scan(&id)
	if err == nil {
		err = tx.QueryRow(r.Context(), `INSERT INTO branch(workshop_id,name) VALUES($1,$2) RETURNING id`, id, in.BranchName).Scan(&bid)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO membership(user_id,workshop_id,branch_id,role) VALUES($1,$2,$3,'admin')`, u.ID, id, bid)
	}
	if err == nil {
		_, err = sqlc.New(tx).InsertAuditEvent(r.Context(), sqlc.InsertAuditEventParams{ActorUserID: pgtype.UUID{Bytes: u.ID, Valid: true}, WorkshopID: pgtype.UUID{Bytes: id, Valid: true}, EntityID: pgtype.UUID{Bytes: id, Valid: true}, Entity: "workshop", Action: "workshop.create"})
	}
	if err != nil || tx.Commit(r.Context()) != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "name": in.Name, "nit": in.NIT, "branch_id": bid})
}
func (s *server) getWorkshop(w http.ResponseWriter, r *http.Request) {
	wc, _ := CurrentWorkshop(r.Context())
	var name string
	var nit *string
	err := s.db.QueryRow(r.Context(), `SELECT name,nit FROM workshop WHERE id=$1`, wc.WorkshopID).Scan(&name, &nit)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	rows, err := s.db.Query(r.Context(), `SELECT id,name FROM branch WHERE workshop_id=$1 AND id=ANY($2::uuid[]) ORDER BY name`, wc.WorkshopID, wc.BranchIDs)
	if err != nil {
		fail(w, 500, "Error interno")
		return
	}
	defer rows.Close()
	branches := []map[string]any{}
	for rows.Next() {
		var id uuid.UUID
		var name string
		if rows.Scan(&id, &name) != nil {
			fail(w, 500, "Error interno")
			return
		}
		branches = append(branches, map[string]any{"id": id, "name": name})
	}
	if rows.Err() != nil {
		fail(w, 500, "Error interno")
		return
	}
	writeJSON(w, 200, map[string]any{"workshop": map[string]any{"id": wc.WorkshopID, "name": name, "nit": nit}, "branches": branches})
}
