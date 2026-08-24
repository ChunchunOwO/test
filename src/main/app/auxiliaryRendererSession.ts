import type { Session } from 'electron';
import { registerCoverProtocolHandler } from '../protocol/coverProtocol';

const registeredAuxiliarySessions = new WeakSet<Session>();

export const ensureAuxiliaryRendererSessionProtocols = (session: Session): void => {
  if (registeredAuxiliarySessions.has(session)) {
    return;
  }

  registerCoverProtocolHandler(session.protocol);
  registeredAuxiliarySessions.add(session);
};
