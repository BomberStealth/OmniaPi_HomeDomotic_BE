// ============================================
// TIPI UTENTE E AUTENTICAZIONE
// ============================================

export enum UserRole {
  CLIENTE = 'cliente',
  INSTALLATORE = 'installatore',
  ADMIN = 'admin'
}

export interface User {
  id: number;
  email: string;
  password: string;
  nome: string;
  cognome: string;
  ruolo: UserRole;
  creato_il: Date;
  aggiornato_il: Date;
}

export interface JWTPayload {
  userId: number;
  email: string;
  ruolo: UserRole;
}

// ============================================
// TIPI IMPIANTO
// ============================================

export interface Impianto {
  id: number;
  nome: string;
  indirizzo: string;
  citta: string;
  cap: string;
  cliente_id: number;
  installatore_id: number;
  utente_id?: number;
  email_proprietario?: string;
  codice_condivisione: string;
  ha_fotovoltaico: boolean;
  fotovoltaico_potenza?: number;
  latitudine?: number;
  longitudine?: number;
  creato_il: Date;
  aggiornato_il: Date;
}

export interface ImpiantoCondiviso {
  id: number;
  impianto_id: number;
  utente_id: number;
  email_utente: string;
  ruolo_condivisione: 'visualizzatore' | 'controllore' | 'amministratore';
  condiviso_il: Date;
}

export interface Piano {
  id: number;
  impianto_id: number;
  nome: string;
  ordine: number;
  creato_il: Date;
}

export interface Stanza {
  id: number;
  piano_id: number;
  nome: string;
  icona?: string;
  ordine: number;
  creato_il: Date;
}

// ============================================
// TIPI DISPOSITIVO
// ============================================

export enum TipoDispositivo {
  LUCE = 'luce',
  TAPPARELLA = 'tapparella',
  TERMOSTATO = 'termostato'
}

export enum StatoDispositivo {
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERRORE = 'errore'
}

export interface Dispositivo {
  id: number;
  stanza_id: number;
  tipo: TipoDispositivo;
  nome: string;
  topic_mqtt: string;
  stato: StatoDispositivo;
  configurazione: any; // JSON specifico per tipo
  creato_il: Date;
  aggiornato_il: Date;
}

// Configurazioni specifiche per tipo dispositivo
export interface ConfigLuce {
  dimmerabile: boolean;
  livello_corrente?: number; // 0-100
  accesa: boolean;
}

export interface ConfigTapparella {
  posizione_corrente: number; // 0-100
  in_movimento: boolean;
}

export interface ConfigTermostato {
  temperatura_corrente: number;
  temperatura_target: number;
  modalita: 'riscaldamento' | 'raffreddamento' | 'auto' | 'spento';
  acceso: boolean;
}

// ============================================
// TIPI SCENE E AUTOMAZIONI
// ============================================

export interface Scena {
  id: number;
  impianto_id: number;
  nome: string;
  icona: string;
  azioni: AzioneScena[];
  creato_il: Date;
}

export interface AzioneScena {
  dispositivo_id: number;
  comando: any; // Comando specifico per tipo dispositivo
}

// ============================================
// TIPI NOTIFICHE
// ============================================

export enum TipoNotifica {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  SUCCESS = 'success'
}

export interface Notifica {
  id: number;
  utente_id: number;
  tipo: TipoNotifica;
  titolo: string;
  messaggio: string;
  letta: boolean;
  creata_il: Date;
}

// ============================================
// TIPI API RESPONSE
// ============================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
