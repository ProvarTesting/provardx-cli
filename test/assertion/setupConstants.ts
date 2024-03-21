export const successMessage = 'Provar Automation was set up successfully.\n';
export const setupError = '';
export const successJsonMessage = {
  status: 0,
  result: {
    success: true,
  },
  warnings: [],
};

export const failureJsonMessage = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'SETUP_ERROR',
        message: 'Provar Automation could not be set up because: Provided version is not a valid version.',
      },
    ],
  },
  warnings: [],
};

export const insufficientPermissions = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'The user does not have permissions to delete the existing folder.',
      },
    ],
  },
  warnings: [],
};
