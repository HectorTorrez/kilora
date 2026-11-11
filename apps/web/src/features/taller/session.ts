import { getRouteApi } from "@tanstack/react-router";
import { createContext, useContext } from "react";

const tallerRoute = getRouteApi("/taller");

export const useTallerContext = () => tallerRoute.useRouteContext();

const WorkshopContext = createContext("");
export const WorkshopProvider = WorkshopContext.Provider;
export const useWorkshopId = () => useContext(WorkshopContext);

/**
 * Sucursal activa dentro del taller. `id` vacío significa "todas las
 * sucursales": las listas no filtran y los formularios usan la primera.
 */
export type ActiveBranch = {
	id: string;
	setId: (id: string) => void;
};

const BranchContext = createContext<ActiveBranch>({ id: "", setId: () => {} });
export const BranchProvider = BranchContext.Provider;
export const useActiveBranch = () => useContext(BranchContext);
