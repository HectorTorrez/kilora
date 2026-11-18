package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"kilora/api/internal/values"
)

const prepareQuote = "prepare_counter_quote"
const prepareService = "prepare_owner_service"

type quoteLine struct {
	Kind        string `json:"kind"`
	Description string `json:"description"`
	Quantity    string `json:"quantity"`
	UnitPrice   string `json:"unit_price"`
}

type quoteInput struct {
	BranchID     string      `json:"branch_id"`
	CustomerID   string      `json:"customer_id,omitempty"`
	CustomerName string      `json:"customer_name"`
	VehicleID    string      `json:"vehicle_id,omitempty"`
	VehicleModel string      `json:"vehicle_model"`
	VehicleMake  string      `json:"vehicle_make,omitempty"`
	VehiclePlate string      `json:"vehicle_plate,omitempty"`
	Items        []quoteLine `json:"items"`
}

type serviceInput struct {
	PerformedOn string `json:"performed_on"`
	Summary     string `json:"summary"`
	Odometer    *int32 `json:"odometer_km,omitempty"`
	Total       string `json:"total,omitempty"`
	Workshop    string `json:"workshop_name_text,omitempty"`
}

type Proposal struct {
	WorkshopID string        `json:"workshop_id,omitempty"`
	VehicleID  string        `json:"vehicle_id,omitempty"`
	Quote      *quoteInput   `json:"quote,omitempty"`
	Service    *serviceInput `json:"service,omitempty"`
}

func (s Session) adminBranches() map[string]string {
	out := map[string]string{}
	for _, m := range s.Memberships {
		if s.ActiveWorkshopID == m.WorkshopID && m.Role == "admin" && (s.ActiveBranchID == "" || s.ActiveBranchID == m.BranchID) {
			out[m.BranchID] = m.BranchName
		}
	}
	return out
}

// branchList describe las sucursales administradas en un orden estable.
func branchList(branches map[string]string) string {
	parts := make([]string, 0, len(branches))
	for id, name := range branches {
		parts = append(parts, fmt.Sprintf("%s (%s)", name, id))
	}
	sort.Strings(parts)
	return strings.Join(parts, "; ")
}

// joinNonEmpty une las partes presentes con un espacio.
func joinNonEmpty(parts ...string) string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return strings.Join(out, " ")
}

func actionTool(s Session) *Tool {
	var name, desc string
	var props map[string]any
	var required []string
	switch {
	case s.Page == "/mis-vehiculos" || strings.HasPrefix(s.Page, "/mis-vehiculos/"):
		name = prepareService
		desc = "Prepara un servicio manual para confirmar. Identifica el vehículo con list_my_vehicles. Pide fecha y descripción si faltan."
		props = map[string]any{
			"vehicle_id":         str("ID del vehículo propio"),
			"summary":            str("Servicio realizado, con los detalles indicados"),
			"performed_on":       str("Fecha AAAA-MM-DD"),
			"odometer_km":        integer("Kilometraje informado"),
			"total":              str("Total informado en USD"),
			"workshop_name_text": str("Nombre del taller informado"),
		}
		required = []string{"vehicle_id", "summary", "performed_on"}
	case s.Page == "/taller" || strings.HasPrefix(s.Page, "/taller/"):
		branches := s.adminBranches()
		if len(branches) == 0 {
			return nil
		}
		name = prepareQuote
		desc = "Prepara una cotización de mostrador para confirmar. Busca al cliente con list_customers y sus vehículos con get_customer. Para coincidencias ambiguas pregunta cuál. Para cliente o vehículo de mostrador usa nombre o modelo libre. Pide los precios que falten."
		item := object(map[string]any{
			"description": str("Concepto"),
			"kind":        map[string]any{"type": "string", "enum": []string{"mano_de_obra", "repuesto"}},
			"quantity":    str("Cantidad decimal"),
			"unit_price":  str("Precio unitario USD"),
		}, []string{"description", "kind", "quantity", "unit_price"})
		props = map[string]any{
			"branch_id":     str("Sucursales administradas, nombre (ID): " + branchList(branches) + ". Si hay varias y no se especificó, pregunta."),
			"customer_id":   str("ID del cliente existente"),
			"customer_name": str("Nombre si es de mostrador"),
			"vehicle_id":    str("ID de un vehículo del cliente"),
			"vehicle_model": str("Modelo si el vehículo no está registrado"),
			"vehicle_make":  str("Marca indicada"),
			"vehicle_plate": str("Placa indicada"),
			"items":         map[string]any{"type": "array", "items": item},
		}
		required = []string{"branch_id", "items"}
	default:
		return nil
	}
	return &Tool{Type: "function", Function: ToolFunction{Name: name, Description: desc, Parameters: object(props, required)}}
}

type actionVehicle struct{ ID, Make, Model, Plate string }

func readActionTarget(ctx context.Context, fetch Fetcher, path string, out any) error {
	status, data, err := fetch(ctx, path)
	if err != nil || status != 200 || json.Unmarshal(data, out) != nil {
		return errors.New("No se pudo verificar el registro seleccionado")
	}
	return nil
}

func prepareAction(ctx context.Context, s Session, call ToolCall, fetch Fetcher) (*Proposal, string, error) {
	args := []byte(call.Function.Arguments)
	switch call.Function.Name {
	case prepareQuote:
		return prepareCounterQuote(ctx, s, args, fetch)
	case prepareService:
		return prepareOwnerService(ctx, args, fetch)
	default:
		return nil, "", errors.New("Acción desconocida")
	}
}

func prepareOwnerService(ctx context.Context, args []byte, fetch Fetcher) (*Proposal, string, error) {
	var in struct {
		VehicleID string `json:"vehicle_id"`
		serviceInput
	}
	if json.Unmarshal(args, &in) != nil || uuid.Validate(in.VehicleID) != nil || strings.TrimSpace(in.Summary) == "" {
		return nil, "", errors.New("Faltan vehículo o descripción del servicio")
	}
	if _, ok := values.PastDate(in.PerformedOn); !ok {
		return nil, "", errors.New("Indica una fecha válida del servicio")
	}
	if _, ok := values.Money(in.Total); in.Total != "" && !ok || in.Odometer != nil && *in.Odometer < 0 {
		return nil, "", errors.New("Monto o kilometraje inválido")
	}
	var v actionVehicle
	if err := readActionTarget(ctx, fetch, "/api/v1/me/vehicles/"+in.VehicleID, &v); err != nil {
		return nil, "", err
	}
	review := fmt.Sprintf("Borrador de servicio para %s\n%s · %s", joinNonEmpty(v.Make, v.Model, v.Plate), in.PerformedOn, in.Summary)
	if in.Odometer != nil {
		review += fmt.Sprintf("\nKilometraje: %d km", *in.Odometer)
	}
	if in.Total != "" {
		review += "\nTotal: $" + in.Total
	}
	if in.Workshop != "" {
		review += "\nTaller: " + in.Workshop
	}
	return &Proposal{VehicleID: in.VehicleID, Service: &in.serviceInput}, review, nil
}

func prepareCounterQuote(ctx context.Context, s Session, args []byte, fetch Fetcher) (*Proposal, string, error) {
	var q quoteInput
	if json.Unmarshal(args, &q) != nil || len(q.Items) == 0 {
		return nil, "", errors.New("Agrega los conceptos de la cotización")
	}
	branch, ok := s.adminBranches()[q.BranchID]
	if !ok {
		return nil, "", errors.New("Elige una sucursal que administres")
	}
	if q.CustomerID != "" {
		if uuid.Validate(q.CustomerID) != nil {
			return nil, "", errors.New("Cliente inválido")
		}
		var customer struct {
			Name     string `json:"full_name"`
			Vehicles []actionVehicle
		}
		if err := readActionTarget(ctx, fetch, "/api/v1/workshops/"+s.ActiveWorkshopID+"/customers/"+q.CustomerID, &customer); err != nil {
			return nil, "", err
		}
		q.CustomerName = customer.Name
		if q.VehicleID != "" {
			found := false
			for _, v := range customer.Vehicles {
				if v.ID == q.VehicleID {
					q.VehicleModel, q.VehicleMake, q.VehiclePlate = v.Model, v.Make, v.Plate
					found = true
					break
				}
			}
			if !found {
				return nil, "", errors.New("El vehículo no pertenece al cliente seleccionado")
			}
		}
	} else if q.VehicleID != "" {
		return nil, "", errors.New("Indica el cliente registrado del vehículo")
	}
	if strings.TrimSpace(q.CustomerName) == "" || !values.VehicleText(q.VehicleModel) {
		return nil, "", errors.New("Falta el nombre del cliente o el modelo del vehículo")
	}
	if q.VehicleMake != "" && !values.VehicleText(q.VehicleMake) || !values.ValidPlate(&q.VehiclePlate) {
		return nil, "", errors.New("Revisa la marca y la placa del vehículo")
	}
	var review strings.Builder
	fmt.Fprintf(&review, "Borrador de cotización para %s · %s\nVehículo: %s", q.CustomerName, branch, joinNonEmpty(q.VehicleMake, q.VehicleModel, q.VehiclePlate))
	total := decimal.Zero
	for _, item := range q.Items {
		qty, qok := values.Quantity(item.Quantity)
		price, pok := values.Money(item.UnitPrice)
		if !qok || !pok || strings.TrimSpace(item.Description) == "" || (item.Kind != "repuesto" && item.Kind != "mano_de_obra") {
			return nil, "", errors.New("Revisa concepto, cantidad y precio de cada ítem")
		}
		fmt.Fprintf(&review, "\n- %s (%s): %s × $%s", item.Description, strings.ReplaceAll(item.Kind, "_", " "), item.Quantity, item.UnitPrice)
		total = total.Add(values.LineTotal(qty, price))
	}
	fmt.Fprintf(&review, "\nTotal: $%s", total.StringFixed(2))
	return &Proposal{WorkshopID: s.ActiveWorkshopID, Quote: &q}, review.String(), nil
}
