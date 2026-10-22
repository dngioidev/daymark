import { isNativeApp } from '../native/daymarkBridge';
import { SIGNED_IN_COOKIE } from '../sync/protocol';

export function getHostMode(): 'server' | 'native' | 'local-web' {
  if (isNativeApp()) return 'native';
  return document.cookie.split(';').some((cookie) => cookie.trim() === `${SIGNED_IN_COOKIE}=1`) ? 'server' : 'local-web';
}
