import { defineMiddleware } from 'astro:middleware';
import { getRequestContext, runWithRequestContext } from './wordpress/context.js';

export const onRequest = defineMiddleware((context, next) => {
  return runWithRequestContext(context, async () => {
    const response = await next();
    const astroPressContext = getRequestContext();

    for (const cookie of astroPressContext.responseCookies) {
      response.headers.append('set-cookie', cookie);
    }

    return response;
  });
});
