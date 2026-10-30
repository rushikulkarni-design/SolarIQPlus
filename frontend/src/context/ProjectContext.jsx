import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useProject } from "@/lib/projectApi";
import { useAuth } from "@/context/AuthContext";

const STORAGE_KEY = "siq_active_project";
const ProjectContext = createContext(null);

const EMPTY_PLANNER = { billFile: null, rooftopFile: null };

export function ProjectProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeProjectId, setActiveProjectId] = useState(() => localStorage.getItem(STORAGE_KEY) || null);
  const [planner, setPlanner] = useState(EMPTY_PLANNER);

  const { data: activeProject, isLoading, isError, error, refetch } = useProject(activeProjectId, {
    enabled: !!activeProjectId && !!user,
  });

  // If the active project can't be loaded (deleted / not owned / unauthenticated), drop it.
  useEffect(() => {
    if (!activeProjectId || !isError) return;
    const status = error?.response?.status;
    if (status === 404 || status === 401 || status === 403) {
      localStorage.removeItem(STORAGE_KEY);
      setActiveProjectId(null);
      setPlanner(EMPTY_PLANNER);
    }
  }, [isError, error, activeProjectId]);

  // Reset everything on logout.
  useEffect(() => {
    if (user === false) {
      localStorage.removeItem(STORAGE_KEY);
      setActiveProjectId(null);
      setPlanner(EMPTY_PLANNER);
    }
  }, [user]);

  const setActiveProject = useCallback((project) => {
    const id = typeof project === "object" && project ? project.id : project;
    setActiveProjectId(id || null);
    setPlanner(EMPTY_PLANNER);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
      if (typeof project === "object") qc.setQueryData(["project", id], project);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [qc]);

  const clearActiveProject = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setActiveProjectId(null);
    setPlanner(EMPTY_PLANNER);
  }, []);

  const refreshProject = useCallback(() => {
    if (activeProjectId) refetch();
  }, [refetch, activeProjectId]);

  const setBillFile = useCallback((f) => setPlanner((p) => ({ ...p, billFile: f })), []);
  const setRooftopFile = useCallback((f) => setPlanner((p) => ({ ...p, rooftopFile: f })), []);

  return (
    <ProjectContext.Provider
      value={{
        activeProjectId,
        activeProject: activeProject || null,
        isLoading: !!activeProjectId && !!user && isLoading,
        isError,
        setActiveProject,
        clearActiveProject,
        refreshProject,
        planner,
        setBillFile,
        setRooftopFile,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export const useProjectContext = () => useContext(ProjectContext);
