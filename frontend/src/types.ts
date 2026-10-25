export type Role = "responsavel" | "cuidador" | "professor" | "terapeuta";

export type User = {
  id: string;
  full_name: string;
  username: string;
  email: string;
  role: Role | null;
};

export type Settings = {
  pictogram_size: "medio" | "grande" | "extra";
  text_size: "normal" | "grande" | "extra";
  speech_rate: number;
  voice: string;
  volume: number;
  hidden_categories: string[];
  history_enabled: boolean;
  speak_on_tap: boolean;
  grid_columns: number;
};

export type CommUser = {
  id: string;
  name: string;
  birth_date?: string | null;
  photo_path?: string | null;
  preferences?: string;
  notes?: string;
  settings: Settings;
  my_role: Role;
};

export type Category = { id: string; key: string; name: string; emoji: string; color: string; order: number; builtin: boolean };

export type Pictogram = {
  id: string;
  category_key: string;
  name: string;
  emoji?: string;
  speech_text?: string;
  image_path?: string | null;
  favorite: boolean;
  order: number;
};

export type Phrase = { id: string; text: string; emoji?: string; favorite: boolean; can_edit?: boolean };

export type Activity = {
  id: string;
  title: string;
  instruction: string;
  display_text?: string;
  emoji?: string;
  image_path?: string | null;
  active: boolean;
  kind?: "atividade" | "aviso";
  audience?: "comunicador" | "rede";
  status?: "pendente" | "realizada";
  created_by_name?: string;
  created_at: string;
};

export type Invitation = { id: string; role: Role; member_name?: string; comm_user_name?: string; comm_user_id: string; expires_at: string };
export type TherapyNote = { id: string; title: string; text: string; is_author: boolean; shared?: { roles: Role[]; title?: string; text?: string }; created_at?: string; shared_at?: string };

export type Step = { id?: string; label: string; emoji?: string; done: boolean };
export type Routine = { id: string; title: string; context: string; steps: Step[] };

export type Board = {
  comm_user: CommUser;
  settings: Settings;
  categories: Category[];
  pictograms: Pictogram[];
  quick_phrases: Phrase[];
  activities: Activity[];
  routines: Routine[];
  synced_at: string;
};

export const ROLE_LABEL: Record<Role, string> = {
  responsavel: "Responsável",
  cuidador: "Cuidador",
  professor: "Professor",
  terapeuta: "Terapeuta",
};

export const BOARD_EDIT: Role[] = ["responsavel"];
export const PROFILE_CREATE: Role[] = ["responsavel", "cuidador"];
export const SCHOOL_EDIT: Role[] = ["responsavel", "professor"];

export const SOURCE_LABEL: Record<string, string> = {
  prancha: "Prancha",
  texto: "Escrever e Falar",
  frase_rapida: "Frase rápida",
  escola: "Escola",
  atividade: "Atividade",
};
