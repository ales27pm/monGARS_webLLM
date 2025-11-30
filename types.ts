export enum Role {
    USER = 'user',
    MODEL = 'model',
    SYSTEM = 'system'
}

export interface Message {
    id: string;
    role: Role;
    text: string;
    timestamp: Date;
    isError?: boolean;
}

export interface ModelConfig {
    id: string;
    name: string;
    size: string;
    description: string;
    params: string;
    quantization: string;
    recommended?: boolean;
    badge?: string;
    modelUrl: string;
    modelLibUrl: string;
}

export interface ToastNotification {
    id: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    duration: number;
}

export interface InitProgressReport {
    text: string;
    progress: number;
}

// Augment window to include webllm
declare global {
    interface Window {
        webllm: any;
    }
}