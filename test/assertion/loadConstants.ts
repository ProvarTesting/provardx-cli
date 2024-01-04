export const sfProvarConfigLoadCommand = 'sf provar config load';
export const loadSuccessMessage = 'The properties file was loaded successfully.\n';
export const invalidPathError = 'Error (1): [INVALID_PATH] The provided path does not exist or is invalid.\n';

export const loadSuccessJson = {
  status: 0,
  result: {
    success: true,
  },
  warnings: [],
};

export const invalidPathJsonError = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        code: 'INVALID_PATH',
        message: 'The provided path does not exist or is invalid.',
      },
    ],
  },
  warnings: [],
};
