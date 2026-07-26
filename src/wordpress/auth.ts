import {
  forwardResponseCookies,
  getRequestContext,
  type AstroPressAstroLike,
  type AstroPressRequestContext,
} from './context.js';
import { getWordPressBaseUrl } from './client.js';

export interface WpCurrentUser {
  id: number;
  username: string;
  email: string;
  name: string;
  displayName: string;
  firstName: string;
  lastName: string;
  roles: string[];
  capabilities: string[];
  avatarUrls: Record<string, string>;
}

export interface WpNonce {
  action: string;
  value: string;
}

export interface WpAuthContext {
  loggedIn: boolean;
  user: WpCurrentUser | null;
  nonce: WpNonce;
  restNonce: string;
  loginUrl: string;
  logoutUrl: string;
  lostPasswordUrl: string;
  registerUrl: string;
  woocommerce?: WpWooCommerceAuthContext | null;
}

export interface WpWooCommerceCustomerAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  postcode?: string;
  country?: string;
  state?: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

export interface WpWooCommerceCustomer {
  id: number;
  username?: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  dateCreated?: string | null;
  dateModified?: string | null;
  isPayingCustomer?: boolean;
  avatarUrl?: string;
  billing: WpWooCommerceCustomerAddress;
  shipping: WpWooCommerceCustomerAddress;
}

export interface WpWooCommerceAuthContext {
  active: boolean;
  customer: WpWooCommerceCustomer | null;
  myAccountUrl: string;
  cartUrl: string;
  checkoutUrl: string;
  storeApiNonce: string;
}

export interface AuthContextOptions {
  action?: string;
  redirectTo?: string;
}

export interface WpPasswordCredentials {
  email?: string;
  username?: string;
  login?: string;
  password: string;
  remember?: boolean;
  redirectTo?: string;
}

export interface WpPasswordResetRequest {
  email?: string;
  username?: string;
  login?: string;
}

export interface WpPasswordReset {
  login: string;
  key: string;
  password: string;
}

export interface WpUserRegistration {
  email: string;
  password: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  remember?: boolean;
  signIn?: boolean;
  redirectTo?: string;
}

export interface WpUserRegistrationResult {
  ok: true;
  user: WpCurrentUser;
  auth: WpAuthContext;
}

export interface WpAuthMessageResult {
  ok: true;
  message: string;
}

export class AstroPressAuthRequiredError extends Error {
  loginUrl: string;
  response: Response;

  constructor(loginUrl: string) {
    super(`Authentication required. Redirect the request to ${loginUrl}.`);
    this.name = 'AstroPressAuthRequiredError';
    this.loginUrl = loginUrl;
    this.response = Response.redirect(loginUrl, 302);
  }
}

export class AstroPressAuthActionError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AstroPressAuthActionError';
    this.status = status;
    this.code = code;
  }
}

export async function getAuthContext(
  input?: AstroPressAstroLike | AuthContextOptions,
  options: AuthContextOptions = {},
): Promise<WpAuthContext> {
  const { context, authOptions } = resolveAuthInput(input, options);
  const action = authOptions.action ?? 'wp_rest';
  const redirectTo = authOptions.redirectTo ?? context.url.pathname;
  const cacheKey = `wordpress:auth:${action}:${redirectTo}`;
  const cached = context.cache.get(cacheKey);

  if (cached) {
    return cached as WpAuthContext;
  }

  const auth = await fetchAuthContext(context, action, redirectTo);
  context.cache.set(cacheKey, auth);
  return auth;
}

export async function getCurrentUser(input?: AstroPressAstroLike | AuthContextOptions): Promise<WpCurrentUser | null> {
  return getAuthContext(input).then((auth) => auth.user);
}

export async function isLoggedIn(input?: AstroPressAstroLike | AuthContextOptions): Promise<boolean> {
  return getAuthContext(input).then((auth) => auth.loggedIn);
}

export async function requireUser(input?: AstroPressAstroLike | AuthContextOptions): Promise<WpCurrentUser> {
  const auth = await getAuthContext(input);

  if (!auth.user) {
    throw new AstroPressAuthRequiredError(auth.loginUrl);
  }

  return auth.user;
}

export async function getNonce(
  input?: AstroPressAstroLike | AuthContextOptions,
  options: AuthContextOptions = {},
): Promise<WpNonce> {
  return getAuthContext(input, options).then((auth) => auth.nonce);
}

export async function loginUrl(input?: AstroPressAstroLike | AuthContextOptions): Promise<string> {
  return getAuthContext(input).then((auth) => auth.loginUrl);
}

export async function logoutUrl(input?: AstroPressAstroLike | AuthContextOptions): Promise<string> {
  return getAuthContext(input).then((auth) => auth.logoutUrl);
}

export async function signInWithPassword(
  credentials: WpPasswordCredentials,
  input?: AstroPressAstroLike,
): Promise<WpAuthContext> {
  const context = getRequestContext(input);
  const login = credentials.login ?? credentials.email ?? credentials.username;

  if (!login) {
    throw new AstroPressAuthActionError(400, 'missing_login', 'Email or username is required.');
  }

  const auth = await postAuthAction<WpAuthContext>(context, 'login', {
    login,
    password: credentials.password,
    remember: credentials.remember ?? false,
    redirectTo: credentials.redirectTo ?? context.url.pathname,
  });

  context.cache.clear();
  context.cache.set(`wordpress:auth:wp_rest:${credentials.redirectTo ?? context.url.pathname}`, auth);
  return auth;
}

export const loginWithPassword = signInWithPassword;

export async function registerUser(
  registration: WpUserRegistration,
  input?: AstroPressAstroLike,
): Promise<WpUserRegistrationResult> {
  const context = getRequestContext(input);
  const result = await postAuthAction<WpUserRegistrationResult>(context, 'register', {
    ...registration,
    signIn: registration.signIn ?? true,
    redirectTo: registration.redirectTo ?? context.url.pathname,
  });

  context.cache.clear();
  context.cache.set(`wordpress:auth:wp_rest:${registration.redirectTo ?? context.url.pathname}`, result.auth);
  return result;
}

export const registerWithPassword = registerUser;

export async function signOut(input?: AstroPressAstroLike): Promise<WpAuthContext> {
  const context = getRequestContext(input);
  const auth = await postAuthAction<WpAuthContext>(context, 'logout', {
    redirectTo: context.url.pathname,
  });

  context.cache.clear();
  context.cache.set(`wordpress:auth:wp_rest:${context.url.pathname}`, auth);
  return auth;
}

export const logout = signOut;

export async function requestPasswordReset(
  request: WpPasswordResetRequest,
  input?: AstroPressAstroLike,
): Promise<WpAuthMessageResult> {
  const context = getRequestContext(input);
  const login = request.login ?? request.email ?? request.username;

  if (!login) {
    throw new AstroPressAuthActionError(400, 'missing_login', 'Email or username is required.');
  }

  return postAuthAction<WpAuthMessageResult>(context, 'request_password_reset', { login });
}

export const sendPasswordResetEmail = requestPasswordReset;

export async function resetPassword(reset: WpPasswordReset, input?: AstroPressAstroLike): Promise<WpAuthMessageResult> {
  const context = getRequestContext(input);
  return postAuthAction<WpAuthMessageResult>(context, 'reset_password', { ...reset });
}

function resolveAuthInput(input: AstroPressAstroLike | AuthContextOptions | undefined, options: AuthContextOptions) {
  if (isAstroLike(input)) {
    return {
      context: getRequestContext(input),
      authOptions: options,
    };
  }

  return {
    context: getRequestContext(),
    authOptions: input ?? options,
  };
}

function isAstroLike(input: unknown): input is AstroPressAstroLike {
  return Boolean(input && typeof input === 'object' && 'request' in input);
}

async function fetchAuthContext(context: AstroPressRequestContext, action: string, redirectTo: string) {
  const phpUrl = process.env.ASTROPRESS_PHP_URL;
  const secret = process.env.ASTROPRESS_INTERNAL_SECRET;

  if (!phpUrl || !secret) {
    throw new Error('WordPress auth helpers are only available during AstroPress SSR. Start the site with `astropress dev`.');
  }

  const url = new URL(`${phpUrl.replace(/\/$/, '')}/index.php`);
  url.searchParams.set('astropress_internal_auth', '1');
  url.searchParams.set('action', action);
  url.searchParams.set('redirect_to', new URL(redirectTo, context.url).toString());

  const response = await fetch(url, {
    headers: authRequestHeaders(context, secret),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`WordPress auth context failed: ${response.status} ${message}`);
  }

  return response.json() as Promise<WpAuthContext>;
}

async function postAuthAction<T>(context: AstroPressRequestContext, action: string, body: Record<string, unknown>): Promise<T> {
  const phpUrl = process.env.ASTROPRESS_PHP_URL;
  const secret = process.env.ASTROPRESS_INTERNAL_SECRET;

  if (!phpUrl || !secret) {
    throw new Error('WordPress auth helpers are only available during AstroPress SSR. Start the site with `astropress dev`.');
  }

  const response = await fetch(`${phpUrl.replace(/\/$/, '')}/index.php?astropress_internal_auth_action=1`, {
    method: 'POST',
    headers: {
      ...authRequestHeaders(context, secret),
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action, ...body }),
  });

  if (!response.ok) {
    const payload = await readAuthActionError(response);
    throw new AstroPressAuthActionError(response.status, payload.code, payload.message);
  }

  forwardResponseCookies(response, context);
  return response.json() as Promise<T>;
}

async function readAuthActionError(response: Response) {
  try {
    const payload = await response.json() as { code?: string; message?: string };
    return {
      code: payload.code ?? 'auth_action_failed',
      message: payload.message ?? `WordPress auth action failed: ${response.status} ${response.statusText}`,
    };
  } catch {
    return {
      code: 'auth_action_failed',
      message: `WordPress auth action failed: ${response.status} ${response.statusText}`,
    };
  }
}

export function authRequestHeaders(context: AstroPressRequestContext, secret: string): HeadersInit {
  const headers: Record<string, string> = {
    'x-astropress-internal-secret': secret,
  };

  if (context.cookie) {
    headers.cookie = context.cookie;
  }

  const publicUrl = process.env.ASTROPRESS_PUBLIC_URL ?? getWordPressBaseUrl();

  if (publicUrl) {
    const url = new URL(publicUrl);
    headers.host = url.host;
    headers['x-forwarded-host'] = url.host;
    headers['x-forwarded-proto'] = url.protocol.replace(':', '');

    if (url.port) {
      headers['x-forwarded-port'] = url.port;
    }

    if (url.protocol === 'https:') {
      headers['x-forwarded-ssl'] = 'on';
    }
  }

  return headers;
}
