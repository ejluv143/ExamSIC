"use server";

import {
  addTeam,
  advanceGame,
  allowRejoin,
  answerGame,
  answerRescue,
  assignTeam,
  balanceTeams,
  claimRescue,
  confirmPassword,
  endGame,
  findByCode,
  getGallery,
  goToQuestion,
  joinGame,
  kickPlayer,
  nextGame,
  openLobby,
  pauseGame,
  pickTeam,
  randomizeTeams,
  rejectPassword,
  removeTeam,
  resumeGame,
  retryQuestion,
  setGameSeconds,
  setStudentPick,
  startGame,
  submitPassword,
} from "@/features/game/data";

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
export const allowRejoinAction = allowRejoin;
export const getGalleryAction = getGallery;
export const pauseGameAction = pauseGame;
export const resumeGameAction = resumeGame;
export const goToQuestionAction = goToQuestion;
export const setGameSecondsAction = setGameSeconds;

// Team Relay.
export const pickTeamAction = pickTeam;
export const retryQuestionAction = retryQuestion;
export const claimRescueAction = claimRescue;
export const answerRescueAction = answerRescue;
export const submitPasswordAction = submitPassword;
export const confirmPasswordAction = confirmPassword;
export const rejectPasswordAction = rejectPassword;
export const assignTeamAction = assignTeam;
export const randomizeTeamsAction = randomizeTeams;
export const balanceTeamsAction = balanceTeams;
export const addTeamAction = addTeam;
export const removeTeamAction = removeTeam;
export const setStudentPickAction = setStudentPick;
