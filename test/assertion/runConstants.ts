export const successMessage = 'The tests were run successfully.\n';
export const errorMessage = 'Error (1): [Test Case 4.testcase] The row locator did not match any rows..\n\n\n';
export const SuccessJson = {
  status: 0,
  result: {
    success: true,
  },
  warnings: [],
};
export const errorJson = {
  status: 0,
  result: {
    success: false,
    errors: [
      {
        testCasePath: 'Test Case 4.testcase',
        message: 'The row locator did not match any rows..',
      },
    ],
  },
  warnings: [],
};