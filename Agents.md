- keep comments to a margin of 80 characters
- Try to keep a margin of around ~90 characters
- Prefer to use explicit else if and else cases instead of early returns, ideally every branch of if/else cases should end in a return (or break or continue or throw) where possible. This can be ignored for highly imperative code such as controllers and cli jobs or where it would result in uglier code.
- Use .length > 0 and .length === 0 instead of .length or !.length

## Backend code patterns
- update api.yaml with all endpoint changes, ensure types are updated to match openapi spec on both backend and frontend
- store business logic to modules in the core/ folder. Prefer to write business logic as pure functions with no side effects that can be unit-tested. Try to keep pure business logic separate from imperative code with side effects.
- store code that handles writing queries, and saving, reading, and formatting code from the database in modules in the model/ folder, try to keep database code abstracted and separate from business logic and controller code.

## Frontend code patterns
- utilize helper functions in lib/lib.ts to handle common tasks on common data types such as arrays, objects, maps, dates, and sets.
- create new helper functions when there is a likelyhood that the behavior will need to be used repeatedly and the behavior is generic.
- Prefer match() from ts-pattern over chained ternaries, in order to preserve a sequential reading of the possible cases.
- Use react.createElement as __ instead of jsx 
- store css in scoped .scss files, one per component/file (eg, Header.ts stores it's styles in Header.scss).
 
## Testing instructions
- Prefer writing unit tests on pure functions to testing the same behavior in controllers
