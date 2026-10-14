// Tipos e acesso tipado ao conteúdo do site.
// Toda a cópia vive em src/data/*.json — edite lá, não aqui.
import profileData from '../data/profile.json';
import projectsData from '../data/projects.json';

export interface Experience {
  role: string;
  company: string;
  period: string;
  highlights: string[];
}

export interface Education {
  course: string;
  institution: string;
  detail?: string;
}

export interface StackGroup {
  label: string;
  items: string[];
  /** Grupo de menor peso visual ("Também uso"). */
  secondary?: boolean;
}

export interface Profile {
  name: string;
  handle: string;
  headline: string;
  pitch: string;
  location: string;
  about: string;
  experience: Experience[];
  education: Education[];
  stack: StackGroup[];
  contact: {
    email: string;
    linkedin: string;
    github: string;
  };
}

export type ProjectStatus = 'em-desenvolvimento';

export interface Project {
  slug: string;
  /** Repositório no formato "owner/name". */
  repo: string;
  title: string;
  description: string;
  tags: string[];
  /** Linhas de meta fixas (ex.: "equipe de 3"). */
  meta: string[];
  /** Sem status = projeto concluído; o badge some. */
  status?: ProjectStatus;
  /** Exibir estrelas do GitHub no card (padrão: true). */
  showStars?: boolean;
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  'em-desenvolvimento': 'em desenvolvimento',
};

export const profile: Profile = profileData;
export const projects: Project[] = projectsData as Project[];
