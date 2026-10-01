import {
  Injectable, ServiceUnavailableException, UnauthorizedException, type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { adminCredentials, cookieValue, isValidSession, SESSION_COOKIE } from '../core/admin_auth';

// The parts of a request the admin endpoints read
export type AdminRequest = { headers: { cookie?: string }, secure: boolean };

// Whether a request carries a valid admin session cookie (see core/admin_auth.ts). Throws 503
// when ADMIN_USERNAME and ADMIN_PASSWORD aren't set.
export const isAdminRequest = (req: AdminRequest): boolean => {
  const admin = adminCredentials(process.env);

  if (!admin) {
    throw new ServiceUnavailableException('The admin panel is closed: ADMIN_USERNAME and ADMIN_PASSWORD are not set');
  }
  else {
    return isValidSession(cookieValue(req.headers.cookie, SESSION_COOKIE), admin, Date.now());
  }
};

// Lets through only requests from a signed-in admin: 401 otherwise
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!isAdminRequest(context.switchToHttp().getRequest<AdminRequest>())) {
      throw new UnauthorizedException('Sign in to the admin panel first');
    }
    else {
      return true;
    }
  }
}
