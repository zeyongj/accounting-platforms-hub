import { useAuth, SignInButton, UserButton } from "@clerk/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole, RefreshCw, Settings2 } from "lucide-react";
import type { Language } from "../lib/types";
import OwnerPanel from "./OwnerPanel";

export default function OwnerAccess({
  language,
  onPublished,
}: {
  language: Language;
  onPublished: () => Promise<void>;
}) {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const [isOwner, setIsOwner] = useState(false);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const lastChecked = useRef(0);
  const zh = language === "zh";
  const refreshAccess = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setIsOwner(false);
    setFailed(false);
    if (!isLoaded || !isSignedIn) {
      setChecking(false);
      setOpen(false);
      return;
    }
    setChecking(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    const deadline = new Promise<never>((_, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(new Error("deadline")),
        { once: true },
      );
    });
    const operation = (async () => {
      const token = await getToken();
      if (!token || controller.signal.aborted) throw new Error("session");
      const response = await fetch("/api/owner", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("permission");
      const value: unknown = await response.json();
      if (
        !value ||
        typeof value !== "object" ||
        !("isOwner" in value) ||
        typeof value.isOwner !== "boolean"
      )
        throw new Error("schema");
      return value.isOwner;
    })();
    void Promise.race([operation, deadline])
      .then((allowed) => {
        if (!active) return;
        setIsOwner(allowed);
        if (!allowed) setOpen(false);
        lastChecked.current = Date.now();
      })
      .catch(() => {
        if (active) {
          setFailed(true);
          setOpen(false);
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setChecking(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [isLoaded, isSignedIn, userId, getToken, attempt]);

  useEffect(() => {
    const onReturn = () => {
      if (!document.hidden && Date.now() - lastChecked.current > 15_000) {
        lastChecked.current = Date.now();
        refreshAccess();
      }
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refreshAccess]);

  if (!isLoaded)
    return (
      <button className="hub-owner-button" disabled>
        <LockKeyhole aria-hidden="true" />
        {zh ? "Owner 登录" : "Owner sign in"}
      </button>
    );
  return (
    <div className="hub-owner-access">
      {!isSignedIn ? (
        <SignInButton mode="modal">
          <button className="hub-owner-button">
            <LockKeyhole aria-hidden="true" />
            {zh ? "Owner 登录" : "Owner sign in"}
          </button>
        </SignInButton>
      ) : (
        <>
          {checking ? (
            <span className="hub-owner-status" role="status">
              {zh ? "核对权限…" : "Checking access…"}
            </span>
          ) : failed ? (
            <button className="hub-owner-button" onClick={refreshAccess}>
              <RefreshCw aria-hidden="true" />
              {zh ? "重试权限检查" : "Retry access check"}
            </button>
          ) : isOwner ? (
            <button className="hub-owner-button" onClick={() => setOpen(true)}>
              <Settings2 aria-hidden="true" />
              {zh ? "管理导航" : "Manage directory"}
            </button>
          ) : (
            <span className="hub-owner-status">
              {zh ? "访客账户" : "Visitor account"}
            </span>
          )}
          <UserButton />
        </>
      )}
      {open && isSignedIn ? (
        <OwnerPanel
          key={userId}
          language={language}
          getToken={getToken}
          onClose={() => setOpen(false)}
          onPublished={onPublished}
          onAccessChanged={refreshAccess}
        />
      ) : null}
    </div>
  );
}
