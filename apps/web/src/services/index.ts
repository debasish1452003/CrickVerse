// Public service API. Server Components and route handlers import `services`
// (the wired container) plus the page-size constants and DTO/domain types.
export { services } from "./container";

export { PLAYERS_PAGE_SIZE } from "./player-service";
export { MATCHES_PAGE_SIZE } from "./match-service";
