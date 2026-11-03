import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicAuthPath, isPublicSavPath } from '@/lib/auth-paths';
import { canAccessAdminPath, normalizeRole, roleLandingPath, usesAdminSpace } from '@/lib/roles';
import type { UserRole } from '@/lib/types';
import { ROLE_COOKIE, ROLE_COOKIE_TTL_SECONDS, readRoleCookie, signRoleCookie } from '@/lib/role-cookie';

export async function updateSession(request: NextRequest) {
  // Formulaire SAV client : public, aucune session ni vérification de rôle.
  if (isPublicSavPath(request.nextUrl.pathname)) {
    return NextResponse.next({ request });
  }

  const isAuthPage = isPublicAuthPath(request.nextUrl.pathname);
  const isSetupPage = request.nextUrl.pathname.startsWith('/setup');
  const isSetupApi = request.nextUrl.pathname.startsWith('/api/setup');

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      if (isAuthPage || isSetupPage || isSetupApi) {
        return NextResponse.next({ request });
      }
      return NextResponse.redirect(new URL('/login', request.url));
    }

    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    // getClaims() rafraîchit la session si besoin puis vérifie la signature du
    // JWT en local (clés asymétriques ES256, JWKS mis en cache). Avant, getUser()
    // faisait un aller-retour vers Supabase Auth à CHAQUE requête (pages, appels
    // API, prefetch) : ~5 000 appels/jour, 66 ms en moyenne, jusqu'à 2,3 s.
    const { data: claimsData } = await supabase.auth.getClaims();
    const userId = typeof claimsData?.claims?.sub === 'string' ? claimsData.claims.sub : null;
    const user = userId ? { id: userId } : null;

    // Rôle : cookie signé si valide, sinon une lecture de `profiles` (puis mise en cache).
    const roleSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let roleCookieToSet: string | null = null;
    const getRole = async (id: string): Promise<UserRole | undefined> => {
      if (roleSecret) {
        const cached = await readRoleCookie(request.cookies.get(ROLE_COOKIE)?.value, id, roleSecret);
        if (cached) return cached;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', id)
        .single();
      const role = normalizeRole(profile?.role);
      if (role && roleSecret) {
        roleCookieToSet = await signRoleCookie(id, role, roleSecret);
      }
      return role;
    };
    const withRoleCookie = (response: NextResponse) => {
      if (roleCookieToSet) {
        response.cookies.set(ROLE_COOKIE, roleCookieToSet, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: ROLE_COOKIE_TTL_SECONDS,
        });
      }
      return response;
    };

    const isTeleproApp = request.nextUrl.pathname.startsWith('/telepro');
    const isAdminApp = request.nextUrl.pathname.startsWith('/admin');

    if (!user && !isAuthPage && !isSetupPage && !isSetupApi) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    // Un utilisateur déjà connecté qui clique sur un lien de réinitialisation doit
    // pouvoir atteindre /auth/confirm et /reset-password, pas être renvoyé sur son dashboard.
    const isPasswordRecovery = request.nextUrl.pathname.startsWith('/reset-password')
      || request.nextUrl.pathname.startsWith('/auth/');
    if (user && (isAuthPage || isSetupPage) && !isPasswordRecovery) {
      const role = await getRole(user.id);
      return withRoleCookie(NextResponse.redirect(new URL(roleLandingPath(role), request.url)));
    }

    if (user && (isTeleproApp || isAdminApp)) {
      const role = await getRole(user.id);
      if (usesAdminSpace(role) && isTeleproApp) {
        return withRoleCookie(NextResponse.redirect(new URL(roleLandingPath(role), request.url)));
      }
      if (role === 'telepro' && isAdminApp) {
        return withRoleCookie(NextResponse.redirect(new URL('/telepro', request.url)));
      }
      if (isAdminApp && !canAccessAdminPath(role, request.nextUrl.pathname)) {
        return withRoleCookie(NextResponse.redirect(new URL(roleLandingPath(role), request.url)));
      }
    }

    return withRoleCookie(supabaseResponse);
  } catch (err) {
    if (isAuthPage || isSetupPage || isSetupApi) {
      return NextResponse.next({ request });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }
}
