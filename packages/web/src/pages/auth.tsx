/**
 * Purpose: Login + signup — the front door. Shared-schema forms, OIDC button
 *          only when the server actually has OIDC configured.
 * Author(s): John Reed
 */

import { zodResolver } from '@hookform/resolvers/zod';
import {
  loginRequestSchema,
  signupRequestSchema,
  userResponseSchema,
  type LoginRequest,
  type SignupRequest,
} from '@okrdokey/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { apiFetch, ApiError } from '../api.js';
import { Button, Card, Field } from '../components/bits.js';

// probe once whether OIDC is wired (404 = not configured)
function useOidcAvailable(): boolean {
  const { data } = useQuery({
    queryKey: ['oidc-available'],
    queryFn: async () => {
      const res = await fetch('/auth/oidc/login', { method: 'HEAD' });
      return res.status !== 404;
    },
    staleTime: Infinity,
  });
  return data ?? false;
}

function AuthFrame({ children, title }: { children: ReactNode; title: string }): ReactNode {
  return (
    <div className="mx-auto max-w-sm pt-24 rise">
      <h1 className="mb-1 font-display text-5xl font-bold tracking-tight">
        OKRdokey<span className="text-ember">.</span>
      </h1>
      <p className="mb-6 text-sm text-ink-soft">spreadsheet-simple OKRs — your data, your box…</p>
      <Card>
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </Card>
    </div>
  );
}

export function LoginPage(): ReactNode {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const oidc = useOidcAvailable();
  const form = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });

  const submit = form.handleSubmit(async (body) => {
    try {
      await apiFetch('/auth/login', userResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await qc.invalidateQueries();
      await navigate({ to: '/' });
    } catch (err) {
      form.setError('root', {
        message: err instanceof ApiError ? err.message : 'login failed',
      });
    }
  });

  return (
    <AuthFrame title="Log in">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field label="Email" type="email" error={form.formState.errors.email?.message} {...form.register('email')} />
        <Field label="Password" type="password" error={form.formState.errors.password?.message} {...form.register('password')} />
        {form.formState.errors.root ? (
          <p className="text-xs text-rag-red">{form.formState.errors.root.message}</p>
        ) : null}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          log in
        </Button>
      </form>
      {oidc ? (
        <a href="/auth/oidc/login" className="mt-3 block">
          <Button variant="ghost" type="button" className="w-full">
            continue with SSO
          </Button>
        </a>
      ) : null}
      <p className="mt-4 text-xs text-ink-soft">
        no account?{' '}
        <Link to="/signup" className="font-semibold text-ember">
          sign up
        </Link>
      </p>
    </AuthFrame>
  );
}

export function SignupPage(): ReactNode {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const form = useForm<SignupRequest>({ resolver: zodResolver(signupRequestSchema) });

  const submit = form.handleSubmit(async (body) => {
    try {
      await apiFetch('/auth/signup', userResponseSchema, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      await qc.invalidateQueries();
      await navigate({ to: '/' });
    } catch (err) {
      form.setError('root', {
        message: err instanceof ApiError ? err.message : 'signup failed',
      });
    }
  });

  return (
    <AuthFrame title="Create your account">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field label="Name" error={form.formState.errors.displayName?.message} {...form.register('displayName')} />
        <Field label="Email" type="email" error={form.formState.errors.email?.message} {...form.register('email')} />
        <Field
          label="Password (10+ chars)"
          type="password"
          error={form.formState.errors.password?.message}
          {...form.register('password')}
        />
        {form.formState.errors.root ? (
          <p className="text-xs text-rag-red">{form.formState.errors.root.message}</p>
        ) : null}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          sign up
        </Button>
      </form>
      <p className="mt-4 text-xs text-ink-soft">
        have an account?{' '}
        <Link to="/login" className="font-semibold text-ember">
          log in
        </Link>
      </p>
    </AuthFrame>
  );
}
