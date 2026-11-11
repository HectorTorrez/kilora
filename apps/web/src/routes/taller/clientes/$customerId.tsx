import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Car, FileText, MessageCircle, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { CustomerForm } from "@/components/kilora/customer-form";
import { FormDialog } from "@/components/kilora/form-dialog";
import { VehicleForm } from "@/components/kilora/vehicle-form";
import {
	BackLink,
	DetailList,
	EmptyState,
	PageBody,
	PageHeader,
	Plate,
	SectionCard,
	VehicleStatusBadge,
} from "@/components/kilora/workshop-ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { customerQuery } from "@/features/taller/customers";
import { useWorkshopId } from "@/features/taller/session";
import { date, km, phone, shortDate } from "@/lib/format";

export const Route = createFileRoute("/taller/clientes/$customerId")({
	component: CustomerPage,
});

function CustomerPage() {
	const { customerId } = Route.useParams();
	const workshopID = useWorkshopId();
	const navigate = useNavigate();
	const [editing, setEditing] = useState(false);
	const [adding, setAdding] = useState(false);
	const customer = useQuery({
		...customerQuery(workshopID, customerId),
		enabled: !!workshopID,
	});

	if (customer.isLoading)
		return (
			<PageBody>
				<Skeleton className="h-24" />
				<div className="grid gap-6 lg:grid-cols-[1fr_340px]">
					<Skeleton className="h-64" />
					<Skeleton className="h-40" />
				</div>
			</PageBody>
		);
	if (customer.error || !customer.data)
		return (
			<PageBody>
				<Alert variant="destructive">
					<AlertDescription>
						{customer.error?.message || "Cliente no disponible"}
					</AlertDescription>
				</Alert>
			</PageBody>
		);

	const c = customer.data;
	const whatsApp = c.phone?.replace(/\D/g, "");

	return (
		<PageBody>
			<PageHeader
				back={<BackLink to="/taller/clientes">Clientes</BackLink>}
				eyebrow={`Cliente desde el ${date(c.created_at)}`}
				title={c.full_name}
				badges={
					c.has_account ? (
						<Badge variant="secondary">Tiene cuenta en Kilora</Badge>
					) : null
				}
				actions={
					<>
						{whatsApp && (
							<Button asChild variant="outline">
								<a
									href={`https://wa.me/${whatsApp}`}
									target="_blank"
									rel="noreferrer"
								>
									<MessageCircle className="size-4" />
									WhatsApp
								</a>
							</Button>
						)}
						<Button variant="outline" onClick={() => setEditing(true)}>
							<Pencil className="size-4" />
							Editar
						</Button>
						<Button asChild variant="outline">
							<Link to="/taller/cotizaciones/nueva" search={{ cliente: c.id }}>
								<FileText className="size-4" />
								Crear cotización
							</Link>
						</Button>
						<Button onClick={() => setAdding(true)}>
							<Plus className="size-4" />
							Registrar vehículo
						</Button>
					</>
				}
			/>

			{!c.phone && (
				<Alert>
					<AlertDescription>
						Este cliente no tiene teléfono registrado. Editalo para poder
						contactarlo por WhatsApp.
					</AlertDescription>
				</Alert>
			)}

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
				<SectionCard
					title="Vehículos"
					description="Vehículos de este cliente atendidos en el taller."
					bodyClassName="p-0 sm:p-0"
				>
					{!c.vehicles.length ? (
						<EmptyState
							icon={Car}
							title="Sin vehículos"
							description="Registrá el primer vehículo de este cliente."
							action={
								<Button onClick={() => setAdding(true)}>
									Registrar vehículo
								</Button>
							}
						/>
					) : (
						<ul className="divide-y">
							{c.vehicles.map((v) => (
								<li key={v.id}>
									<Link
										to="/taller/vehiculos/$vehicleId"
										params={{ vehicleId: v.id }}
										className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60 sm:px-5"
									>
										<Plate value={v.plate} />
										<span className="min-w-0 flex-1">
											<span className="block truncate text-[13px] font-medium">
												{v.make} {v.model}
												{v.year ? (
													<span className="ml-1.5 font-normal text-ink-3">
														{v.year}
													</span>
												) : null}
											</span>
											<span className="block truncate text-xs text-ink-3">
												{v.last_odometer_km != null
													? `${km(v.last_odometer_km)} · `
													: ""}
												Última actividad {shortDate(v.last_activity_at)}
											</span>
										</span>
										<VehicleStatusBadge status={v.status} />
									</Link>
								</li>
							))}
						</ul>
					)}
				</SectionCard>

				<SectionCard title="Datos de contacto">
					<DetailList
						items={[
							{ label: "Nombre", value: c.full_name },
							{
								label: "Teléfono",
								value: phone(c.phone),
								mono: true,
								empty: "Sin teléfono",
							},
							{ label: "Correo", value: c.email, empty: "Sin correo" },
							{
								label: "Cuenta Kilora",
								value: c.has_account ? "Vinculada" : "Sin cuenta",
							},
						]}
					/>
				</SectionCard>
			</div>

			<FormDialog
				open={editing}
				onOpenChange={setEditing}
				title="Editar cliente"
			>
				<CustomerForm
					workshopID={workshopID}
					customer={c}
					onSaved={() => setEditing(false)}
				/>
			</FormDialog>
			<FormDialog
				open={adding}
				onOpenChange={setAdding}
				title={`Registrar vehículo de ${c.full_name}`}
				description="Solo marca y modelo son obligatorios. Podés invitar al propietario después."
			>
				<VehicleForm
					workshopID={workshopID}
					customer={c}
					onCreated={(created) => {
						setAdding(false);
						void navigate({
							to: "/taller/vehiculos/$vehicleId",
							params: { vehicleId: created.id },
						});
					}}
				/>
			</FormDialog>
		</PageBody>
	);
}
