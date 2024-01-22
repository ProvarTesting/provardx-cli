export const sfProvarConfigSetCommand = 'sf provar config set';
export const setSuccessJson = {
  status: 0,
  result: {
    success: true,
  },
  warnings: [],
};

export const missingPropertyJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'MISSING_PROPERTY',
        message: 'The property is missing.',
      },
    ],
  },
  warnings: [],
};

export const missingValueJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'MISSING_VALUE',
        message: 'The value is missing.',
      },
    ],
  },
  warnings: [],
};

export const invalidArgumentJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'INVALID_ARGUMENT',
        message: 'The property/value cannot be parsed.',
      },
    ],
  },
  warnings: [],
};
