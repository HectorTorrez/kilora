import { getRouteApi } from "@tanstack/react-router";
import { createContext, useContext } from "react";

const tallerRoute = getRouteApi("/taller");

export const useTallerContext = () => tallerRoute.useRouteContext();

const WorkshopContext = createContext("");
export const WorkshopProvider = WorkshopContext.Provider;
export const useWorkshopId = () => useContext(WorkshopContext);
