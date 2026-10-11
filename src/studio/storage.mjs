import { parseProject, serializeProject } from './project.mjs';
import { fail } from '../reference/errors.mjs';

const key = 'ems.studio.projects.v1';
/** A single atomic storage write keeps project data and project selection together. */
export class ProjectStorage {
  constructor(storage) { this.storage = storage; }
  read() {
    const source = this.storage.getItem(key);
    if (!source) return { schemaVersion: 'ems-studio-storage/1', active: null, projects: {} };
    if (source.length > 4 * 1024 * 1024) fail('STORAGE_LIMIT', 'Project storage too large');
    let data; try { data = JSON.parse(source); } catch { fail('INVALID_STORAGE', 'Malformed saved projects'); }
    if (!data || data.schemaVersion !== 'ems-studio-storage/1' || Object.keys(data).sort().join(',') !== 'active,projects,schemaVersion' ||
        !data.projects || typeof data.projects !== 'object' || Array.isArray(data.projects) || Object.keys(data.projects).length > 50 ||
        data.active !== null && (typeof data.active!=='string'||!Object.hasOwn(data.projects, data.active))) fail('INVALID_STORAGE', 'Invalid project storage');
    for (const [id, source] of Object.entries(data.projects)) if (parseProject(source).id !== id) fail('INVALID_STORAGE', 'Stored identity mismatch');
    return data;
  }
  list() { return Object.values(this.read().projects).map(source => { const project = parseProject(source); return { id: project.id, name: project.name }; }); }
  load(id = this.read().active) { const data=this.read(),source=Object.hasOwn(data.projects,id)?data.projects[id]:null; return source ? parseProject(source) : null; }
  save(project) {
    const source = serializeProject(project), data = this.read();
    if (!Object.hasOwn(data.projects, project.id) && Object.keys(data.projects).length >= 50) fail('STORAGE_LIMIT', 'Too many saved projects');
    Object.defineProperty(data.projects, project.id, { value: source, enumerable: true, configurable: true, writable: true }); data.active = project.id;
    const encoded = JSON.stringify(data); if (encoded.length > 4 * 1024 * 1024) fail('STORAGE_LIMIT', 'Project storage too large');
    this.storage.setItem(key, encoded);
  }
}
