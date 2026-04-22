module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: false
  },
  env: {
    node: true,
    es2022: true
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  ignorePatterns: ["dist", "build", "coverage", ".expo", ".turbo"]
};
