import { getWordPressBaseUrl } from './client.js';

export interface WpMenuItem {
  id: number;
  parent: number;
  title: string;
  url: string;
  target: string;
  classes: string[];
  object: string;
  objectId: number;
  type: string;
}

export interface WpMenu {
  id: number;
  slug: string;
  name: string;
  items: WpMenuItem[];
}

export interface WpMenusPayload {
  registeredLocations: Record<string, string>;
  locations: Record<string, number>;
  menus: WpMenu[];
}

export async function getMenus(): Promise<WpMenusPayload> {
  const response = await fetch(`${getWordPressBaseUrl()}/wp-json/astropress/v1/menus`);

  if (!response.ok) {
    throw new Error(`Could not fetch WordPress menus: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<WpMenusPayload>;
}

export async function getMenuByLocation(location: string): Promise<WpMenu | null> {
  const payload = await getMenus();
  const menuId = payload.locations[location];

  if (!menuId) {
    return null;
  }

  return payload.menus.find((menu) => menu.id === menuId) ?? null;
}

export async function getMenuBySlug(slug: string): Promise<WpMenu | null> {
  const payload = await getMenus();
  return payload.menus.find((menu) => menu.slug === slug) ?? null;
}
