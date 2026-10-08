"use server";

import {
  advanceGame,
  answerGame,
  endGame,
  findByCode,
  getGallery,
  joinGame,
  kickPlayer,
  nextGame,
  openLobby,
  startGame,
} from "@/lib/data/game";

// What the browser calls during a game. Each one re-checks the role on the server.
export const findByCodeAction = findByCode;
export const joinGameAction = joinGame;
export const answerGameAction = answerGame;
export const nextGameAction = nextGame;
export const openLobbyAction = openLobby;
export const startGameAction = startGame;
export const advanceGameAction = advanceGame;
export const endGameAction = endGame;
export const kickPlayerAction = kickPlayer;
export const getGalleryAction = getGallery;
