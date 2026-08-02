import type { Member, Cooperative } from '../db/schema.js';
import type { User } from '../types/index.js';

export function toPublicUser(member: Member): User {
  return {
    id: member.id,
    name: member.name,
    phone: member.phone,
    pin: '',
    role: member.role,
    cooperativeName: member.cooperativeName,
    savingsBalance: member.savingsBalance,
    profileImage: member.profileImage,
    status: member.status,
    joinDate: member.joinDate,
  };
}

export function getCooperativeId(coop: Cooperative): string {
  return coop.id;
}
