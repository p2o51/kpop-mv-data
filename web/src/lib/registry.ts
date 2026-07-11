import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export type Company = {
  id: string;
  name: string;
  name_ko?: string;
  country?: string;
  parent?: string;
  type?: string;
  notes?: string;
};

export type Group = {
  id: string;
  name: string;
  name_ko?: string;
  company?: string;
  debut?: string;
  status?: string;
  gender?: string;
  type?: string;
  notes?: string;
  disbanded?: string;
};

export type Channel = {
  id: string;
  youtube_channel_id: string;
  uploads_playlist_id?: string;
  title: string;
  company?: string;
  kind?: string;
  priority?: string;
  track_groups?: string[];
  notes?: string;
};

export type Video = {
  youtube_video_id: string;
  group: string;
  channel: string;
  title?: string;
  published_at?: string;
  video_class?: string;
  track_title?: string;
  active?: boolean;
  notes?: string;
};

const registryRoot = join(process.cwd(), "..", "registry");

function loadYaml<T>(name: string): T {
  const text = readFileSync(join(registryRoot, name), "utf8");
  return yaml.load(text) as T;
}

export function loadRegistry() {
  const companies = loadYaml<Company[]>("companies.yaml") ?? [];
  const groups = loadYaml<Group[]>("groups.yaml") ?? [];
  const channels = loadYaml<Channel[]>("channels.yaml") ?? [];
  const videosRaw = loadYaml<Video[] | null>("videos.yaml");
  const videos = Array.isArray(videosRaw) ? videosRaw : [];
  return { companies, groups, channels, videos };
}
