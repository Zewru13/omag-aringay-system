export const validateRequired = (value) => {
  if (!value || !value.toString().trim()) {
    return "This field is required.";
  }
  return null;
};

export const validateRSBSA = (value) => {
  if (!value) {
    return "RSBSA number must be 10 to 20 alphanumeric characters.";
  }

  const rsbsaRegex = /^[a-zA-Z0-9]{10,20}$/;
  if (!rsbsaRegex.test(value.trim())) {
    return "RSBSA number must be 10 to 20 alphanumeric characters.";
  }

  return null;
};

export const validatePhone = (value) => {
  if (!value) {
    return null; // phone is optional
  }

  const phoneRegex = /^09\d{9}$/;
  if (!phoneRegex.test(value.trim())) {
    return "Phone number must be in format 09XXXXXXXXX.";
  }

  return null;
};

// Keeps a phone input honest as the user types: digits only, and never more
// than the 11 characters a 09XXXXXXXXX number can hold.
export const sanitizePhoneDigits = (value) => {
  return (value || "").replace(/\D/g, "").slice(0, 11);
};

export const validateEmail = (value) => {
  if (!value) {
    return null; // Optional field
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(value.trim())) {
    return "Invalid email address";
  }

  return null;
};

export const validatePasswordMatch = (password, confirmPassword) => {
  if (password !== confirmPassword) {
    return "Passwords do not match";
  }
  return null;
};

export const validatePasswordStrength = (password) => {
  if (!password) {
    return "Password is required";
  }

  if (password.length < 6) {
    return "Password must be at least 6 characters";
  }

  return null;
};
