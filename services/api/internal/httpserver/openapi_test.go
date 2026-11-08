package httpserver

import (
	"net/http"
	"os"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"gopkg.in/yaml.v3"
)

func TestOpenAPIRoutesMatchRouter(t *testing.T) {
	data, err := os.ReadFile("../../../../packages/contracts/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var spec struct {
		Paths map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal(data, &spec); err != nil {
		t.Fatal(err)
	}
	documented := map[string]bool{}
	for path, methods := range spec.Paths {
		for method := range methods {
			switch method {
			case "get", "post", "put", "patch", "delete", "options", "head", "trace":
				documented[strings.ToUpper(method)+" "+path] = true
			}
		}
	}
	router, ok := NewRouter(Deps{}).(chi.Routes)
	if !ok {
		t.Fatal("router does not implement chi.Routes")
	}
	actual := map[string]bool{}
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		actual[method+" "+route] = true
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for route := range actual {
		if !documented[route] {
			t.Errorf("route missing from OpenAPI: %s", route)
		}
	}
	for route := range documented {
		if !actual[route] {
			t.Errorf("OpenAPI route missing from router: %s", route)
		}
	}
}
