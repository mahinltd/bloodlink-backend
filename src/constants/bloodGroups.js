export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const BLOOD_COMPONENTS = ['whole_blood', 'platelets', 'plasma'];

// রিকোয়েস্ট করা গ্রুপ -> কোন গ্রুপের ডোনার দিতে পারবে (রোডম্যাপ পর্ব ৭)
export const COMPATIBLE_DONORS = {
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'A-': ['A-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'AB+': ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'O+': ['O+', 'O-'],
  'O-': ['O-'],
};

// বিরল গ্রুপ — ম্যাচিং শুরু থেকেই বড় ব্যাসার্ধে (রোডম্যাপ পর্ব ৭)
export const RARE_BLOOD_GROUPS = ['O-', 'AB-'];