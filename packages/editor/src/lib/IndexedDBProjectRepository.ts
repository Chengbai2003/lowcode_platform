import {
  ProjectRepository,
  Project,
  ProjectMeta,
} from "@lowcode-platform/types";
import { set, get, del } from "idb-keyval";

const PROJECT_META_KEY = "project_metas";

export class IndexedDBProjectRepository implements ProjectRepository {
  async save(project: Project): Promise<void> {
    // 更新项目数据
    await set(`project_${project.meta.id}`, project);

    // 更新元数据列表
    const metas: ProjectMeta[] = (await get(PROJECT_META_KEY)) || [];
    const existingIndex = metas.findIndex(
      (meta) => meta.id === project.meta.id,
    );

    if (existingIndex >= 0) {
      metas[existingIndex] = project.meta;
    } else {
      metas.push(project.meta);
    }

    await set(PROJECT_META_KEY, metas);
  }

  async load(id: string): Promise<Project | null> {
    return (await get(`project_${id}`)) || null;
  }

  async list(): Promise<ProjectMeta[]> {
    return (await get(PROJECT_META_KEY)) || [];
  }

  async delete(id: string): Promise<void> {
    await del(`project_${id}`);

    // 从元数据列表中移除
    let metas: ProjectMeta[] = (await get(PROJECT_META_KEY)) || [];
    metas = metas.filter((meta) => meta.id !== id);
    await set(PROJECT_META_KEY, metas);
  }

  async exists(id: string): Promise<boolean> {
    const project = await this.load(id);
    return project !== null;
  }

  async export(id: string): Promise<string> {
    const project = await this.load(id);
    if (!project) {
      throw new Error(`Project with id ${id} not found`);
    }
    return JSON.stringify(project, null, 2);
  }

  async import(data: string): Promise<Project> {
    const project: Project = JSON.parse(data);
    await this.save(project);
    return project;
  }
}
