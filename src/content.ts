// Lê e valida o conteúdo do site (data/profile.json e data/projects.json).
// Toda a cópia vive nesses arquivos: para mudar um texto, edite o JSON, não o
// código.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { httpURL, isRepoName } from "./validate.ts";

/** Dados pessoais e de carreira exibidos na página. */
export interface Profile {
  name: string;
  handle: string;
  headline: string;
  pitch: string;
  location: string;
  /** Opcional: a área de foco, mostrada num dos quadros de "Sobre". */
  focus: string;
  about: string;
  experience: Experience[];
  education: Education[];
  stack: StackGroup[];
  contact: Contact;
}

/** Um emprego ou estágio. */
export interface Experience {
  role: string;
  company: string;
  period: string;
  highlights: string[];
}

/** Um curso da seção "Formação". */
export interface Education {
  course: string;
  institution: string;
  detail: string;
}

/** Uma linha da seção "Stack". */
export interface StackGroup {
  label: string;
  items: string[];
  /** Marca o grupo de menor peso visual ("Também uso"). */
  secondary: boolean;
}

/** Os canais de contato. */
export interface Contact {
  email: string;
  linkedin: string;
  github: string;
}

/**
 * Andamento de um projeto. Vazio = concluído, e o badge não aparece.
 * "em-desenvolvimento" é o único status aceito hoje.
 */
export type Status = "" | "em-desenvolvimento";
export const STATUS_IN_DEVELOPMENT = "em-desenvolvimento";

/** Texto exibido no badge de status. */
export function statusLabel(s: Status): string {
  return s === STATUS_IN_DEVELOPMENT ? "em desenvolvimento" : s;
}

/** Um card da seção "Projetos". */
export interface Project {
  slug: string;
  /** Repositório no formato "dono/nome". */
  repo: string;
  title: string;
  description: string;
  tags: string[];
  /** Linhas fixas de contexto (ex.: "equipe de 3"). */
  meta: string[];
  status: Status;
  /** Controla as estrelas do GitHub no card (padrão: true). */
  showStars: boolean | null;
}

/** Informa se o card pode exibir as estrelas do GitHub. */
export function starsEnabled(p: Project): boolean {
  return p.showStars !== false;
}

/** Todo o conteúdo carregado de um diretório de dados. */
export interface Content {
  profile: Profile;
  projects: Project[];
}

export class ContentError extends Error {
  override name = "ContentError";
}

// Esquema dos JSON: o decodificador é estrito, como o do Go
// (DisallowUnknownFields): campo desconhecido ou de tipo errado vira erro.
// null vale como campo ausente.
type Schema = "string" | "boolean" | "nullable-boolean" | { array: Schema } | { object: Record<string, Schema> };

const contactSchema: Schema = { object: { email: "string", linkedin: "string", github: "string" } };
const profileSchema: Schema = {
  object: {
    name: "string",
    handle: "string",
    headline: "string",
    pitch: "string",
    location: "string",
    focus: "string",
    about: "string",
    experience: {
      array: { object: { role: "string", company: "string", period: "string", highlights: { array: "string" } } },
    },
    education: { array: { object: { course: "string", institution: "string", detail: "string" } } },
    stack: { array: { object: { label: "string", items: { array: "string" }, secondary: "boolean" } } },
    contact: contactSchema,
  },
};
const projectsSchema: Schema = {
  array: {
    object: {
      slug: "string",
      repo: "string",
      title: "string",
      description: "string",
      tags: { array: "string" },
      meta: { array: "string" },
      status: "string",
      showStars: "nullable-boolean",
    },
  },
};

function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "lista";
  return { string: "texto", number: "número", boolean: "booleano", object: "objeto" }[typeof v as string] ?? typeof v;
}

/** Decodifica value conforme schema, preenchendo os campos ausentes com o valor zero. */
function decode(value: unknown, schema: Schema, at: string): unknown {
  if (schema === "string") {
    if (value === null || value === undefined) return "";
    if (typeof value !== "string") throw new ContentError(`${at}: esperava texto, veio ${typeName(value)}`);
    return value;
  }
  if (schema === "boolean" || schema === "nullable-boolean") {
    if (value === null || value === undefined) return schema === "boolean" ? false : null;
    if (typeof value !== "boolean") throw new ContentError(`${at}: esperava booleano, veio ${typeName(value)}`);
    return value;
  }
  if ("array" in schema) {
    if (value === null || value === undefined) return [];
    if (!Array.isArray(value)) throw new ContentError(`${at}: esperava lista, veio ${typeName(value)}`);
    return value.map((item, i) => decode(item, schema.array, `${at}[${i}]`));
  }
  const fields = schema.object;
  if (value === null || value === undefined) value = {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ContentError(`${at}: esperava objeto, veio ${typeName(value)}`);
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!Object.hasOwn(fields, key)) throw new ContentError(`${at}: campo desconhecido "${key}"`);
  }
  const out: Record<string, unknown> = {};
  for (const [key, sub] of Object.entries(fields)) out[key] = decode(obj[key], sub, `${at}.${key}`);
  return out;
}

async function decodeFile(file: string, schema: Schema, root: string): Promise<unknown> {
  const text = await readFile(file, "utf8");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new ContentError(`${file}: JSON inválido: ${(err as Error).message}`);
  }
  try {
    return decode(raw, schema, root);
  } catch (err) {
    throw new ContentError(`${file}: ${(err as Error).message}`);
  }
}

/** Lê profile.json e projects.json de dir e valida os dois. */
export async function loadContent(dir: string): Promise<Content> {
  const profile = (await decodeFile(path.join(dir, "profile.json"), profileSchema, "profile")) as Profile;
  const projects = (await decodeFile(path.join(dir, "projects.json"), projectsSchema, "projects")) as Project[];
  const c: Content = { profile, projects };
  validateContent(c);
  return c;
}

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Confere os campos obrigatórios e os formatos. Todos os problemas
 * encontrados são devolvidos juntos, um por linha.
 */
export function validateContent(c: Content): void {
  const errs: string[] = [];
  const required = (field: string, value: string) => {
    if (value.trim() === "") errs.push(`${field}: campo obrigatório`);
  };
  // Espaços nas pontas também são recusados: o valor vai como está para o href.
  const mustBeHTTP = (field: string, value: string) => {
    if (httpURL(value) === null || value.trim() !== value) errs.push(`${field}: URL http(s) inválida ${JSON.stringify(value)}`);
  };

  const p = c.profile;
  required("profile.name", p.name);
  required("profile.handle", p.handle);
  required("profile.headline", p.headline);
  required("profile.pitch", p.pitch);
  required("profile.location", p.location);
  required("profile.about", p.about);
  required("profile.contact.email", p.contact.email);
  mustBeHTTP("profile.contact.linkedin", p.contact.linkedin);
  mustBeHTTP("profile.contact.github", p.contact.github);
  if (p.contact.email !== "" && !p.contact.email.includes("@")) {
    errs.push(`profile.contact.email: e-mail inválido ${JSON.stringify(p.contact.email)}`);
  }

  p.experience.forEach((job, i) => {
    const field = `profile.experience[${i}]`;
    required(`${field}.role`, job.role);
    required(`${field}.company`, job.company);
    required(`${field}.period`, job.period);
  });
  p.education.forEach((edu, i) => {
    const field = `profile.education[${i}]`;
    required(`${field}.course`, edu.course);
    required(`${field}.institution`, edu.institution);
  });
  p.stack.forEach((group, i) => {
    const field = `profile.stack[${i}]`;
    required(`${field}.label`, group.label);
    if (group.items.length === 0) errs.push(`${field}.items: lista vazia`);
  });

  const slugs = new Set<string>();
  c.projects.forEach((proj, i) => {
    const field = `projects[${i}]`;
    required(`${field}.title`, proj.title);
    required(`${field}.description`, proj.description);
    if (!slugPattern.test(proj.slug)) {
      errs.push(`${field}.slug: use letras minúsculas, números e hífens (recebido ${JSON.stringify(proj.slug)})`);
    } else if (slugs.has(proj.slug)) {
      errs.push(`${field}.slug: ${JSON.stringify(proj.slug)} repetido`);
    }
    slugs.add(proj.slug);
    proj.meta.forEach((line, j) => required(`${field}.meta[${j}]`, line));
    if (!isRepoName(proj.repo)) {
      errs.push(`${field}.repo: use o formato dono/nome (recebido ${JSON.stringify(proj.repo)})`);
    }
    if (proj.status !== "" && proj.status !== STATUS_IN_DEVELOPMENT) {
      errs.push(
        `${field}.status: valor desconhecido ${JSON.stringify(proj.status)} (use "${STATUS_IN_DEVELOPMENT}" ou remova o campo)`,
      );
    }
  });

  if (errs.length > 0) throw new ContentError(`conteúdo inválido:\n${errs.join("\n")}`);
}
