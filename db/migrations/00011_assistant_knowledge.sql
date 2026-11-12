-- +goose Up
-- Base de conocimiento del asistente (RAG). Cada fila es un fragmento de la
-- documentación de ayuda con su embedding. El id es el hash del contenido y del
-- modelo, así que solo se vuelve a calcular lo que cambió.
CREATE TABLE assistant_knowledge_chunk (
    id         text PRIMARY KEY,
    source     text NOT NULL,
    title      text NOT NULL,
    content    text NOT NULL,
    model      text NOT NULL,
    embedding  real[] NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- +goose Down
DROP TABLE assistant_knowledge_chunk;
