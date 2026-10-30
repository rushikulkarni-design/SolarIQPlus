import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

// GET /api/projects
export function useProjects(options = {}) {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects")).data,
    ...options,
  });
}

// GET /api/projects/{id}
export function useProject(projectId, options = {}) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data,
    enabled: !!projectId,
    retry: false,
    ...options,
  });
}

// POST /api/projects
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload) => (await api.post("/projects", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}
