export interface AuthUser {
  id: string;
  userName: string;
  email: string;
  role: string;
  token: string;
  profilePicturePath?: string | null;
  isBanned?: boolean;
  banReason?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  id?: string;
  userId?: string;
  userName?: string;
  username?: string;
  email?: string;
  role?: string;
  token: string;
  reputation?: number;
  isBanned?: boolean;
  banReason?: string | null;
}

export interface RegisterRequest {
  userName: string;
  email: string;
  phoneNumber: string | null;
  password: string;
  acceptTerms: boolean;
}
