package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"kilora/api/internal/auth"
	"kilora/api/internal/config"
	"kilora/api/internal/database"
	"kilora/api/internal/history"
)

func main() {
	reset := flag.Bool("reset", false, "reiniciar datos demo")
	if len(os.Args) > 1 && os.Args[1] == "--" {
		os.Args = append(os.Args[:1], os.Args[2:]...)
	}
	flag.Parse()
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	ctx := context.Background()
	db, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	tx, err := db.Begin(ctx)
	if err != nil {
		log.Fatal(err)
	}
	defer tx.Rollback(ctx)
	if err = seed(ctx, tx, *reset); err != nil {
		log.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		log.Fatal(err)
	}
	fmt.Println("Datos demo listos")
}
func seed(ctx context.Context, tx pgx.Tx, reset bool) error {
	exec := func(q string, args ...any) error { _, err := tx.Exec(ctx, q, args...); return err }
	var exists bool
	if err := tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM app_user WHERE email='taller@demo.kilora.app')").Scan(&exists); err != nil {
		return err
	}
	if exists && !reset {
		return nil
	}
	if reset {
		// Solo el seed suspende estos triggers, dentro de la transacción de reinicio.
		if err := exec("CREATE TEMP TABLE demo_workshops ON COMMIT DROP AS SELECT DISTINCT m.workshop_id AS id FROM membership m JOIN app_user u ON u.id=m.user_id JOIN workshop w ON w.id=m.workshop_id WHERE (u.email='taller@demo.kilora.app' AND w.name='Taller Los Volcanes') OR (u.email='ceiba@demo.kilora.app' AND w.name='AutoServicio La Ceiba')"); err != nil {
			return err
		}
		for _, q := range []string{
			"ALTER TABLE correction DISABLE TRIGGER correction_append_only", "ALTER TABLE history_record DISABLE TRIGGER history_record_append_only", "ALTER TABLE audit_event DISABLE TRIGGER audit_event_append_only",
			"DELETE FROM audit_event WHERE workshop_id IN (SELECT id FROM demo_workshops) OR actor_user_id IN (SELECT id FROM app_user WHERE email LIKE '%@demo.kilora.app')",
			"DELETE FROM correction WHERE history_record_id IN (SELECT id FROM history_record WHERE vehicle_id IN (SELECT id FROM vehicle WHERE created_by_workshop_id IN (SELECT id FROM demo_workshops) OR owner_user_id IN (SELECT id FROM app_user WHERE email LIKE '%@demo.kilora.app'))) OR created_by IN (SELECT id FROM app_user WHERE email LIKE '%@demo.kilora.app')",
			"DELETE FROM history_record WHERE vehicle_id IN (SELECT id FROM vehicle WHERE created_by_workshop_id IN (SELECT id FROM demo_workshops) OR owner_user_id IN (SELECT id FROM app_user WHERE email LIKE '%@demo.kilora.app'))",
			"DELETE FROM invitation WHERE workshop_id IN (SELECT id FROM demo_workshops)", "DELETE FROM odometer_reading WHERE vehicle_id IN (SELECT id FROM vehicle WHERE created_by_workshop_id IN (SELECT id FROM demo_workshops) OR owner_user_id IN (SELECT id FROM app_user WHERE email LIKE '%@demo.kilora.app'))",
			"DELETE FROM quote WHERE workshop_id IN (SELECT id FROM demo_workshops)", "DELETE FROM work_order WHERE workshop_id IN (SELECT id FROM demo_workshops)", "DELETE FROM vehicle_link WHERE workshop_id IN (SELECT id FROM demo_workshops)", "DELETE FROM vehicle WHERE created_by_workshop_id IN (SELECT id FROM demo_workshops) OR owner_user_id IN (SELECT id FROM app_user WHERE email LIKE '%@demo.kilora.app')", "DELETE FROM membership WHERE workshop_id IN (SELECT id FROM demo_workshops)", "DELETE FROM branch WHERE workshop_id IN (SELECT id FROM demo_workshops)", "DELETE FROM workshop WHERE name IN ('Taller Los Volcanes','AutoServicio La Ceiba')", "DELETE FROM app_user WHERE email LIKE '%@demo.kilora.app'",
			"ALTER TABLE correction ENABLE TRIGGER correction_append_only", "ALTER TABLE history_record ENABLE TRIGGER history_record_append_only", "ALTER TABLE audit_event ENABLE TRIGGER audit_event_append_only",
		} {
			if err := exec(q); err != nil {
				return err
			}
		}
	}
	hash, err := auth.HashPassword("demo1234")
	if err != nil {
		return err
	}
	users := make([]uuid.UUID, 4)
	for i, u := range [][3]string{{"taller@demo.kilora.app", "Administrador Volcanes", ""}, {"recepcion@demo.kilora.app", "Recepción Santa Tecla", ""}, {"propietario@demo.kilora.app", "María Hernández", "+50370001234"}, {"ceiba@demo.kilora.app", "Administrador La Ceiba", ""}} {
		users[i] = uuid.New()
		if err = exec("INSERT INTO app_user(id,email,password_hash,full_name,phone,email_verified_at) VALUES($1,$2,$3,$4,NULLIF($5,''),now())", users[i], u[0], hash, u[1], u[2]); err != nil {
			return err
		}
	}
	w, c, b1, b2, bc := uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{"INSERT INTO workshop(id,name,verified_at,verified_by) VALUES($1,'Taller Los Volcanes',now(),'Equipo Kilora'),($2,'AutoServicio La Ceiba',NULL,NULL)", []any{w, c}},
		{"INSERT INTO branch(id,workshop_id,name) VALUES($1,$4,'San Salvador · Escalón'),($2,$4,'Santa Tecla'),($3,$5,'Principal')", []any{b1, b2, bc, w, c}},
		{"INSERT INTO membership(user_id,workshop_id,branch_id,role) VALUES($1,$4,$6,'admin'),($1,$4,$7,'admin'),($2,$4,$7,'recepcion'),($3,$5,$8,'admin')", []any{users[0], users[1], users[3], w, c, b1, b2, bc}},
	} {
		if err = exec(q.sql, q.args...); err != nil {
			return err
		}
	}
	vehicle := uuid.New()
	if err = exec("INSERT INTO vehicle(id,owner_user_id,created_by_workshop_id,status,plate,make,model,year) VALUES($1,$2,$3,'vinculado','P512834','Toyota','Corolla',2018)", vehicle, users[2], w); err != nil {
		return err
	}
	if err = exec("INSERT INTO vehicle_link VALUES($1,$2,now()),($1,$3,now())", vehicle, w, c); err != nil {
		return err
	}
	descriptions := []string{"Cambio de aceite y filtro", "Cambio de aceite y filtro", "Pastillas de freno", "Cambio de batería", "Cambio de aceite y filtro", "Llantas y alineación", "Amortiguadores delanteros", "Cambio de aceite y filtro"}
	brands := []string{"Mobil", "Mobil", "Bosch", "Bosch", "Mobil", "Michelin", "Monroe", "Mobil"}
	cats := []string{"aceite", "aceite", "frenos", "bateria", "aceite", "llantas", "amortiguadores", "aceite"}
	for i, desc := range descriptions {
		workshop, branch, actor, num := w, b1, users[0], i+1
		if i > 5 {
			num--
		}
		if i == 5 {
			workshop, branch, actor, num = c, bc, users[3], 1
		}
		order, job, rec := uuid.New(), uuid.New(), uuid.New()
		date := time.Now().AddDate(0, -24+i*3, 0)
		km := 38000 + i*4700
		if i == 1 {
			km = 42500
		}
		brand, cat := brands[i], cats[i]
		price := []string{"25.00", "25.00", "45.00", "55.00", "25.00", "175.00", "120.00", "25.00"}[i]
		cost := []string{"12.00", "12.00", "22.00", "30.00", "12.00", "90.00", "60.00", "12.00"}[i]
		notes := "Revisar en próximo servicio"
		qty := 1.0
		items, _ := history.EncodeItems([]history.Item{{Kind: "trabajo", Description: desc, Category: &cat, Price: &price, InternalCost: &cost, MechanicNotes: &notes}, {Kind: "pieza", Description: desc, Name: &desc, Brand: &brand, Quantity: &qty, Price: &price, InternalCost: &cost}})
		for _, q := range []struct {
			sql  string
			args []any
		}{
			{"INSERT INTO work_order(id,workshop_id,branch_id,vehicle_id,number,status,reason,odometer_km,received_at,completed_at,created_by,internal_notes,public_notes) VALUES($1,$2,$3,$4,$5,'listo',$6,$7,$8,$8,$9,'Costo interno y seguimiento','Servicio realizado y revisado')", []any{order, workshop, branch, vehicle, num, desc, km, date, actor}},
			{"INSERT INTO job(id,work_order_id,position,description,category,labor_price,internal_cost,mechanic_notes) VALUES($1,$2,1,$3,$4,$6,$7,$5)", []any{job, order, desc, cat, notes, price, cost}},
			{"INSERT INTO part(job_id,name,brand,unit_price,internal_cost) VALUES($1,$2,$3,$4,$5)", []any{job, desc, brand, price, cost}},
			{"INSERT INTO history_record(id,vehicle_id,workshop_id,work_order_id,source,performed_on,odometer_km,summary,items,total,workshop_notes,internal_cost,internal_notes,created_by) VALUES($1,$2,$3,$4,'taller',$5,$6,$7,$8,($10::numeric * 2),'Servicio realizado y revisado',($11::numeric * 2),'Costo interno y seguimiento',$9)", []any{rec, vehicle, workshop, order, date, km, desc, items, actor, price, cost}},
			{"INSERT INTO odometer_reading(vehicle_id,km,read_at,source,work_order_id,recorded_by) VALUES($1,$2,$3,'orden',$4,$5)", []any{vehicle, km, date, order, actor}},
			{"INSERT INTO audit_event(actor_user_id,workshop_id,entity,entity_id,action,created_at) VALUES($1,$2,'work_order',$3,'work_order.create',$5),($1,$2,'history_record',$4,'history.publish',$5)", []any{actor, workshop, order, rec, date}},
		} {
			if err = exec(q.sql, q.args...); err != nil {
				return err
			}
		}
		if i == 1 {
			if err = exec("INSERT INTO correction(history_record_id,reason,changes,created_by,created_at) VALUES($1,'Kilometraje mal digitado','{\"odometer_km\": 42700}',$2,$3)", rec, users[2], date.AddDate(0, 0, 2)); err != nil {
				return err
			}
		}
	}
	manualPrice := "35.00"
	manualItems, _ := history.EncodeItems([]history.Item{{Kind: "trabajo", Description: "Lavado de inyectores", Price: &manualPrice}})
	if err = exec("INSERT INTO history_record(vehicle_id,source,performed_on,odometer_km,summary,items,total,workshop_notes,created_by) VALUES($1,'propietario',current_date-250,63000,'Lavado de inyectores',$3,35,'Realizado en: Servicentro',$2)", vehicle, users[2], manualItems); err != nil {
		return err
	}
	for i := 0; i < 8; i++ {
		v, o := uuid.New(), uuid.New()
		status := []string{"recibido", "diagnostico", "en_reparacion", "cancelado"}[i%4]
		if err = exec("INSERT INTO vehicle(id,created_by_workshop_id,status,plate,make,model,year,contact_name,contact_phone) VALUES($1,$2,'provisional',$3,'Honda','Civic',2017,$4,'+50370001111')", v, w, fmt.Sprintf("P%06d", 420000+i), fmt.Sprintf("Cliente %d", i+1)); err != nil {
			return err
		}
		if i == 7 {
			if err = exec("UPDATE vehicle SET owner_user_id=$2,status='vinculado' WHERE id=$1", v, users[2]); err != nil {
				return err
			}
		}
		if err = exec("INSERT INTO vehicle_link(vehicle_id,workshop_id) VALUES($1,$2)", v, w); err != nil {
			return err
		}
		if err = exec("INSERT INTO work_order(id,workshop_id,branch_id,vehicle_id,number,status,reason,created_by,cancelled_at,cancel_reason) VALUES($1,$2,$3,$4,$5,$6::work_order_status,'Revisión general',$7,CASE WHEN $6::work_order_status='cancelado' THEN now() END,CASE WHEN $6::work_order_status='cancelado' THEN 'Cliente canceló' END)", o, w, b2, v, 8+i, status, users[0]); err != nil {
			return err
		}
		if i < 2 {
			outcome := "pendiente"
			if i == 1 {
				outcome = "acepto"
			}
			quoteID := uuid.New()
			if err = exec("INSERT INTO quote(id,work_order_id,workshop_id,total,outcome,shared_at,share_expires_at,created_by,outcome_at,outcome_by) VALUES($1,$2,$3,90,$4,now(),now()+interval '15 days',$5::uuid,CASE WHEN $4::quote_outcome='acepto' THEN now() END,CASE WHEN $4::quote_outcome='acepto' THEN $5::uuid END)", quoteID, o, w, outcome, users[0]); err != nil {
				return err
			}
			if err = exec("INSERT INTO quote_item(quote_id,position,kind,description,quantity,unit_price) VALUES($1,1,'mano_de_obra','Revisión y reparación',1,90)", quoteID); err != nil {
				return err
			}
		}
		if err = exec("INSERT INTO audit_event(actor_user_id,workshop_id,entity,entity_id,action) VALUES($1,$2,'work_order',$3,'work_order.create'),($1,$2,'vehicle',$4,'vehicle.create')", users[0], w, o, v); err != nil {
			return err
		}
		if i == 0 {
			if err = exec("INSERT INTO invitation(vehicle_id,workshop_id,email,token_hash,expires_at,created_by) VALUES($1,$2,'cliente@example.com','demo-invitation',now()+interval '15 days',$3)", v, w, users[0]); err != nil {
				return err
			}
		}
	}
	return nil
}
