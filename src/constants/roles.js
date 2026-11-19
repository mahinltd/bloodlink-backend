// BloodLink Backend - User & Admin Roles
const USER_ROLES = {
  DONOR: 'donor',
  USER: 'user',
};

const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  VERIFICATION_ADMIN: 'verification_admin',
  SUPPORT_ADMIN: 'support_admin',
  CONTENT_ADMIN: 'content_admin',
  MONITORING_ADMIN: 'monitoring_admin',
};

const USER_ROLE_LIST = Object.values(USER_ROLES);
const ADMIN_ROLE_LIST = Object.values(ADMIN_ROLES);

module.exports = { USER_ROLES, ADMIN_ROLES, USER_ROLE_LIST, ADMIN_ROLE_LIST };