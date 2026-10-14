import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { MonitoredAsset, PanelPush } from "../types/entities";

export const useMonitoredAssets = (systemId?: string) => useQuery({ queryKey:["monitored-assets",systemId], queryFn:async()=>(await api.get<MonitoredAsset[]>("/api/monitored-assets",{params:{system_id:systemId}})).data, enabled:!!systemId });
export const usePushHistory = (systemId?: string) => useQuery({ queryKey:["panel-pushes",systemId], queryFn:async()=>(await api.get<PanelPush[]>(`/api/panels/system/${systemId}/push-history`)).data, enabled:!!systemId });
export function useSaveMonitoredAsset(){ const qc=useQueryClient(); return useMutation({mutationFn:async({id,data}:{id?:string,data:Partial<MonitoredAsset>})=>id?(await api.patch(`/api/monitored-assets/${id}`,data)).data:(await api.post("/api/monitored-assets",data)).data,onSuccess:()=>qc.invalidateQueries({queryKey:["monitored-assets"]})}); }
export function useDeleteMonitoredAsset(){ const qc=useQueryClient(); return useMutation({mutationFn:(id:string)=>api.delete(`/api/monitored-assets/${id}`),onSuccess:()=>qc.invalidateQueries({queryKey:["monitored-assets"]})}); }
export function usePushPanel(){ const qc=useQueryClient(); return useMutation({mutationFn:(id:string)=>api.post(`/api/panels/${id}/push`),onSuccess:()=>{qc.invalidateQueries({queryKey:["panels"]});qc.invalidateQueries({queryKey:["monitored-assets"]});qc.invalidateQueries({queryKey:["panel-pushes"]});}}); }
