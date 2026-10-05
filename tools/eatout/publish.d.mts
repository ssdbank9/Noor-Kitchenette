export function round4(n: number): number;
export function placeCoords(latitude: unknown, longitude: unknown): { lat?: number; lng?: number };
export function publicUrl(u: unknown): string | null;
export function assertNoHomeLocation(text: string, home?: { lat: number; lng: number }): void;
export function publicList(list: any, home?: { lat: number; lng: number }): any;
