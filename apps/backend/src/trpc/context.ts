import { inferAsyncReturnType } from '@trpc/server';
import { FetchCreateContextFnOptions } from '@trpc/server/adapters/fetch';
import { type CreateNextContextOptions } from '@trpc/server/adapters/next';
import { getServerSession } from 'next-auth';

export async function createContext(opts: CreateNextContextOptions | FetchCreateContextFnOptions) {
  // Get the session from better-auth
  const session = await getServerSession(opts.req, opts.res);

  return {
    session,
    req: opts.req,
    res: opts.res,
  };
}

export type BaseContext = inferAsyncReturnType<typeof createContext>;
