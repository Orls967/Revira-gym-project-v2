import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

export interface ApplicationReceipt {
  applicationId?: number;
  status: 'pending';
  recordedAt: number;
}
export const PENDING_KNOWLEDGE_MS = 5 * 60 * 1000;
const keyFor = (id: number) => `membership_application_${id}`;
export const readApplicationReceipt = (raw: string | null): ApplicationReceipt | null => {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value?.status !== 'pending' || !Number.isFinite(value.recordedAt) || value.recordedAt > Date.now()) return null;
    if (value.applicationId !== undefined && !Number.isInteger(value.applicationId)) return null;
    return { status: 'pending', recordedAt: value.recordedAt, ...(value.applicationId !== undefined ? { applicationId: value.applicationId } : {}) };
  } catch { return null; }
};

// /me has no separate renewal-application status. Cache is a historical hint ONLY.
export function useMembershipApplication(userId: number | undefined, session: string | null) {
  const ownerKey = `${userId}:${session}`;
  const [state, setState] = useState<{ owner: string; receipt: ApplicationReceipt | null; known: boolean }>({ owner: ownerKey, receipt: null, known: false });
  const revision = useRef(0);
  const identity = useRef({ userId, session });
  useEffect(() => {
    identity.current = { userId, session };
    let active = true;
    const readingRevision = ++revision.current;
    if (userId !== undefined && session) {
      void SecureStore.getItemAsync(keyFor(userId)).then(raw => {
        if (active && readingRevision === revision.current) setState({ owner: ownerKey, receipt: readApplicationReceipt(raw), known: false });
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [userId, session, ownerKey]);
  useEffect(() => {
    if (!state.known || !state.receipt) return;
    const timer = setTimeout(() => setState(previous => ({ ...previous, known: false })), Math.max(0, state.receipt.recordedAt + PENDING_KNOWLEDGE_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [state]);
  const notePending = (applicationId?: number) => {
    if (userId === undefined || !session || identity.current.userId !== userId || identity.current.session !== session) return;
    revision.current += 1;
    const next: ApplicationReceipt = { status: 'pending', recordedAt: Date.now(), ...(Number.isInteger(applicationId) ? { applicationId } : {}) };
    setState({ owner: ownerKey, receipt: next, known: true });
    // No names, phone numbers, images, plan/payment details or authentication data.
    void SecureStore.setItemAsync(keyFor(userId), JSON.stringify(next)).catch(() => undefined);
  };
  const owned = state.owner === ownerKey;
  return { receipt: owned ? state.receipt : null, knownPending: owned && state.known, notePending };
}
