import { setCachedAuth } from "@playfit/core/store";
import type { User } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type AuthUser = { id: string; email: string; isAnonymous: boolean };

export function usePlayfitAuth(localFirst = false) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [useLocalProfile, setUseLocalProfile] = useState(false);

  const handleAuth = useCallback((userId: string, email: string, isAnonymous = false) => {
    setUseLocalProfile(false);
    setAuthUser({ id: userId, email, isAnonymous });
  }, []);

  const handleLocalProfile = useCallback(() => {
    setUseLocalProfile(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    function mapAuthUser(user: User) {
      const isAnonymous = user.is_anonymous === true;
      return {
        id: user.id,
        email: isAnonymous ? "Guest profile" : (user.email ?? ""),
        isAnonymous,
      };
    }

    async function ensureSession() {
      try {
        const res = await supabase.auth.getSession();
        const session = res.data.session;
        if (cancelled) return;

        if (session?.user) {
          setCachedAuth(session.access_token ?? null, session.user.id);
          setUseLocalProfile(false);
          setAuthUser(mapAuthUser(session.user));
          return;
        }

        if (localFirst) {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (cancelled) return;

          if (!error && data.session?.user) {
            setCachedAuth(data.session.access_token ?? null, data.session.user.id);
            setUseLocalProfile(false);
            setAuthUser(mapAuthUser(data.session.user));
            return;
          }

          setUseLocalProfile(true);
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) setAuthBusy(false);
      }
    }

    void ensureSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCachedAuth(session.access_token, session.user.id);
        setUseLocalProfile(false);
        setAuthUser(mapAuthUser(session.user));
      } else {
        setCachedAuth(null, null);
        setAuthUser(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [localFirst]);

  return {
    authUser,
    authBusy,
    useLocalProfile,
    setAuthUser,
    setUseLocalProfile,
    handleAuth,
    handleLocalProfile,
  };
}
