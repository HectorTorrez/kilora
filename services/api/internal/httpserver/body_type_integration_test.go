package httpserver

import "testing"

func TestOwnerVehicleBodyType(t *testing.T) {
	api := newTestAPI(t)
	owner, other := api.client(), api.client()
	api.register(owner)
	api.register(other)

	v := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Hilux","body_type":"pickup"}`, 201)
	if v["body_type"] != "pickup" {
		t.Fatalf("body_type al crear: %v", v["body_type"])
	}
	id := v["id"].(string)
	path := "/api/v1/me/vehicles/" + id + "/body-type"

	api.req(owner, "POST", "/api/v1/me/vehicles", `{"make":"Toyota","model":"Hilux","body_type":"tanque"}`, 400)
	api.req(owner, "PUT", path, `{"body_type":"avion"}`, 400)
	api.req(owner, "PUT", path, `{}`, 400)
	api.req(other, "PUT", path, `{"body_type":"suv"}`, 404)

	if got := api.obj(owner, "PUT", path, `{"body_type":"camion"}`, 200); got["body_type"] != "camion" {
		t.Fatalf("body_type al actualizar: %v", got["body_type"])
	}
	if got := api.obj(owner, "GET", "/api/v1/me/vehicles/"+id, "", 200); got["body_type"] != "camion" {
		t.Fatalf("body_type al consultar: %v", got["body_type"])
	}
	// Sin tipo indicado, el vehículo queda en null.
	if plain := api.obj(owner, "POST", "/api/v1/me/vehicles", `{"make":"Kia","model":"Rio"}`, 201); plain["body_type"] != nil {
		t.Fatalf("body_type por defecto: %v", plain["body_type"])
	}
}
