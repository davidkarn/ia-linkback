// ESLint for the backend: api/, lib/, spider/ and the scripts at the top level. web/ has its own linter (oxlint).
// Usage (from src/):  npm run lint    (npm run lint -- --fix to apply the automatic fixes)
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

import alignAssignments from "eslint-plugin-align-assignments";
import reactHooks from "eslint-plugin-react-hooks";
import { fixupPluginRules } from "@eslint/compat";


export default tseslint.config(
  {
    ignores: [
      'node_modules/',
      'web/',
      'output/',
            // Emacs backups, autosaves and lock files
      '**/*~',
      '**/#*#',
      '**/.#*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    plugins: {
      "align-assignments": fixupPluginRules(alignAssignments),
      "react-hooks":       reactHooks,
    },
    rules: {
      "no-trailing-spaces":       "error",
      "linebreak-style":          ["error", "unix"],
      "no-plusplus":              0,
      "no-underscore-dangle":     0,
      "operator-linebreak":       ["error", "before"],
      "template-curly-spacing":   ["error", "always"],
      "no-mixed-spaces-and-tabs": "error",
      "no-undef":                 0,
      "curly":                    ["error", "all"],

      "comma-spacing": ["error", {
        "before": false,
        "after":  true,
      }],

      "key-spacing": ["error", {
        "beforeColon": false,
        "afterColon":  true,
        "align":       "value",
        "mode":        "minimum",
      }],

      "dot-location": ["error", "property"],

      "prefer-const": ["error", {
        "destructuring": "all",
      }],

      "semi": ["error", "always"],

      "semi-spacing": ["error", {
        "before": false,
        "after":  true,
      }],

      "semi-style":                  ["error", "last"],
      "space-before-blocks":         ["error", "always"],
      "space-before-function-paren": ["error", "never"],
      "space-infix-ops":             "error",
      "func-call-spacing":           ["error", "never"],
      "computed-property-spacing":   ["error", "never"],

      "space-unary-ops": ["error", {
        "words":    true,
        "nonwords": false,
      }],

      "function-paren-newline": ["off"],
      "arrow-parens":           ["error", "always"],
      "space-in-parens":        ["error", "never"],

      "align-assignments/align-assignments": ["error"],

      "array-bracket-spacing": ["error", "never"],
      "object-curly-spacing":  ["error", "always"],

      "object-property-newline": ["error", {
        "allowAllPropertiesOnSameLine": true,
      }],

      "no-empty":              ["error"],
      "array-bracket-newline": ["error", "consistent"],
      "no-constant-condition": ["error"],
      "no-unreachable":        ["error"],

      "brace-style": ["error", "stroustrup", {
        "allowSingleLine": true,
      }],

      "indent": [
        "error", 2, {
          "VariableDeclarator": "first",
          "MemberExpression":   1,

          "FunctionDeclaration": {
            "parameters": "first",
          },

          "FunctionExpression": {
            "parameters": "first",
          },

          "CallExpression": {
            "arguments": "first",
          },

          "ArrayExpression":          "first",
          "ObjectExpression":         "first",
          "ImportDeclaration":        "first",
          "flatTernaryExpressions":   false,
          "offsetTernaryExpressions": true,
          "ignoreComments":           true,
        }
      ],

      "react-hooks/rules-of-hooks":  "error",
      "react-hooks/exhaustive-deps": "error",
    }
  },
  {
    files: ["**/*.test.ts"],

    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  }
);
