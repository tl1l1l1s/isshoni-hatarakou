// 유일한 모듈 등록 목록. 기능 하나는 import 한 줄이고 이 줄을 지우면 기능 전체가 빠진다 (10.3의 1번).
import type { ModuleManifest } from '@core/types';
import account from './account';
import awaypic from './awaypic';
import chat from './chat';
import focus from './focus';
import friends from './friends';
import gacha from './gacha';
import goals from './goals';
import growth from './growth';
import home from './home';
import launcher from './launcher';
import play from './play';
import photo from './photo';
import phone from './phone';
import pomodoro from './pomodoro';
import rooms from './rooms';
import seating from './seating';
import sound from './sound';
import status from './status';
import stickers from './stickers';
import wardrobe from './wardrobe';
import scheduler from './scheduler';
import dday from './dday';
import upcoming from './upcoming';
import notice from './notice';
import report from './report';

export const modules = [account, focus, growth, status, wardrobe, rooms, gacha, stickers, chat, friends, home, sound, launcher, awaypic, scheduler, dday, upcoming, play, seating, photo, goals, pomodoro, phone, notice, report] as ModuleManifest[];
