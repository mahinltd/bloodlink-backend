// BloodLink Backend - Blood Request Lifecycle Status
const REQUEST_STATUS = {
  PENDING: 'pending',
  SEARCHING: 'searching_donors',
  DONOR_RESPONDED: 'donor_responded',
  DONOR_CONFIRMED: 'donor_confirmed',
  BLOOD_ARRANGED: 'blood_arranged',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
};

const REQUEST_STATUS_LIST = Object.values(REQUEST_STATUS);

// এই status-গুলোতে matching/notification চলতে থাকবে
const ACTIVE_REQUEST_STATUSES = [
  REQUEST_STATUS.PENDING,
  REQUEST_STATUS.SEARCHING,
  REQUEST_STATUS.DONOR_RESPONDED,
];

module.exports = { REQUEST_STATUS, REQUEST_STATUS_LIST, ACTIVE_REQUEST_STATUSES };