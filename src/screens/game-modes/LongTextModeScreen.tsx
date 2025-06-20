import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Pressable,
  StatusBar,
  ScrollView,
} from 'react-native';
import { LightTheme, Typography, Spacing } from '@/constants/theme';
import { validateJapaneseInput } from '@/utils/japaneseInput';
import { getRandomLongText } from '@/data/longTexts';
import { createAdvancedTextMapping, splitTextForDisplay, getTargetCharAtPosition, validateInputAtPosition } from '@/utils/textMapping';
import type { LongTextContent, LongTextSettings } from '@/types';
import type { TextMapping } from '@/utils/textMapping';

interface LongTextModeScreenProps {
  route?: {
    params: {
      settings?: LongTextSettings;
    };
  };
  navigation?: {
    goBack: () => void;
  };
}

/**
 * 長文模式遊戲畫面
 * 類似一般模式的介面，但用於打字長篇日文文章
 */
export const LongTextModeScreen: React.FC<LongTextModeScreenProps> = ({ route, navigation }) => {
  const settings: LongTextSettings = route?.params?.settings || {
    includeSpaces: true,
    includePunctuation: true,
    textLength: 'short',
    textType: 'article',
    showProgress: true,
    allowBackspace: true,
  };

  // 遊戲狀態
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'paused' | 'finished'>('idle');
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lives, setLives] = useState(3);
  const [currentText, setCurrentText] = useState<LongTextContent | null>(null);
  const [textMapping, setTextMapping] = useState<TextMapping | null>(null);
  const [userInput, setUserInput] = useState('');
  const [gameTime, setGameTime] = useState(0);
  const [currentPosition, setCurrentPosition] = useState(0);
  const [errors, setErrors] = useState(0);
  
  // ScrollView ref for auto-scroll
  const scrollViewRef = useRef<ScrollView>(null);

  // 追蹤當前行數
  const [currentLineNumber, setCurrentLineNumber] = useState(0);
  
  // 自動滾動函數 - 當移動到新行時，將該行滾動到第一行位置
  const autoScroll = useCallback((position: number, totalLength: number) => {
    if (!scrollViewRef.current || !textMapping || !currentText) return;
    
    // 獲取當前顯示的文本
    const { completedPart, currentChar } = splitTextForDisplay(textMapping, position);
    const textUpToCurrent = completedPart + currentChar;
    
    // 自動滾動邏輯 - 每完成一定數量的字符就滾動
    const lineHeight = 40; // 對應樣式中的行高
    const charsPerScroll = 12; // 每12個字符滾動一次（更頻繁）
    
    // 計算應該滾動的次數
    const newScrollCount = Math.floor(textUpToCurrent.length / charsPerScroll);
    
    // 當滾動次數改變時就滾動
    if (newScrollCount !== currentLineNumber) {
      setCurrentLineNumber(newScrollCount);
      
      // 滾動距離 = 滾動次數 * 行高
      const scrollToY = newScrollCount * lineHeight;
      
      // 平滑滾動到新位置
      scrollViewRef.current.scrollTo({
        y: scrollToY,
        animated: true,
      });
    }
  }, [textMapping, currentText, currentLineNumber]);

  // 監聽位置變化，觸發自動滾動
  useEffect(() => {
    if (textMapping && currentPosition > 0) {
      autoScroll(currentPosition, textMapping.totalInputLength);
    }
  }, [currentPosition, textMapping, autoScroll]);

  // 遊戲開始
  const startGame = useCallback(() => {
    // 先生成文章內容
    const difficulty = settings.textLength === 'short' ? 'beginner' : 'normal';
    const newText = getRandomLongText(difficulty);
    
    // 創建文本映射
    const displayContent = newText.displayContent || newText.content;
    const inputContent = newText.inputContent || newText.content;
    const mapping = createAdvancedTextMapping(displayContent, inputContent);
    
    // 設置遊戲狀態
    setCurrentText(newText);
    setTextMapping(mapping);
    setCurrentPosition(0);
    setUserInput('');
    setErrors(0);
    setScore(0);
    setCombo(0);
    setLives(3);
    setGameTime(0);
    setCurrentLineNumber(0); // 重置行數
    setGameState('playing');
  }, [settings]);

  // 處理輸入
  const handleInputChange = useCallback((text: string) => {
    if (!currentText || !textMapping || gameState !== 'playing') return;

    setUserInput(text);

    // 獲取目標字符用於調試
    const targetChar = getTargetCharAtPosition(textMapping, currentPosition);
    
    // 添加調試日誌
    console.log(`[長文模式調試] 輸入: "${text}", 目標: "${targetChar}"`);

    // 使用新的驗證系統（支援多讀音和三段式輸入）
    const validation = validateInputAtPosition(textMapping, text, currentPosition);
    
    // 詳細的調試信息
    console.log(`[長文模式調試] 驗證結果:`, {
      isValid: validation.isValid,
      isComplete: validation.isComplete,
      canContinue: validation.canContinue,
      possibleChars: validation.possibleChars
    });
    
    if (validation.isComplete) {
      console.log(`[長文模式調試] ✅ 字符完成，移動到下一個位置`);
      // 當前字符輸入完成，移動到下一個字符
      const newPosition = currentPosition + 1;
      setCurrentPosition(newPosition);
      setUserInput(''); // 清空輸入，準備輸入下一個字符
      
      // 增加分數和連擊
      const points = 5 * (combo + 1);
      setScore(prev => prev + points);
      setCombo(prev => prev + 1);
      
      // 檢查是否完成整個文章
      if (newPosition >= textMapping.totalInputLength) {
        // 完成文章，額外獎勵
        const bonusPoints = textMapping.totalInputLength * 10;
        setScore(prev => prev + bonusPoints);
        endGame();
      }
    } else if (!validation.canContinue && text.length > 0) {
      console.log(`[長文模式調試] ❌ 輸入錯誤，扣分`);
      // 只有在確實無法繼續時才視為錯誤
      // 這樣可以支援三段式輸入（は→ば→ぱ）
      setCombo(0);
      setErrors(prev => prev + 1);
      setLives(prev => Math.max(0, prev - 1));
      setUserInput(''); // 清空錯誤輸入
      
      if (lives <= 1) {
        endGame();
      }
    } else {
      console.log(`[長文模式調試] ⏳ 允許繼續輸入`);
    }
    // 如果 validation.canContinue 為 true，保持當前輸入狀態，允許繼續輸入
  }, [currentText, textMapping, currentPosition, combo, lives, gameState]);

  // 結束遊戲
  const endGame = useCallback(() => {
    setGameState('finished');
  }, []);

  // 暫停/恢復遊戲
  const togglePause = useCallback(() => {
    setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
  }, []);

  // 返回主選單
  const goBackToMenu = useCallback(() => {
    navigation?.goBack();
  }, [navigation]);

  // 遊戲計時器
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (gameState === 'playing') {
      interval = setInterval(() => {
        setGameTime(prev => prev + 1);
      }, 1000);
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [gameState]);

  // 渲染文字內容
  const renderTextContentWithParagraphs = () => {
    if (!currentText || !textMapping) {
      return (
        <View style={styles.textDisplayContainer}>
          <Text style={styles.textTitle}>載入中...</Text>
          <View style={styles.textContentContainer}>
            <Text style={styles.remainingText}>正在載入文章內容...</Text>
          </View>
        </View>
      );
    }

    // 使用文本映射來正確分割顯示文字
    const { completedPart, currentChar, remainingPart } = splitTextForDisplay(textMapping, currentPosition);

    return (
      <View style={styles.textDisplayContainer}>
        <Text style={styles.textTitle}>{currentText.title}</Text>
        <ScrollView 
          ref={scrollViewRef}
          style={styles.textContentContainer} 
          showsVerticalScrollIndicator={true}
          scrollEventThrottle={16}
        >
          <View style={styles.textWrapper}>
            <Text style={styles.simpleText}>
              <Text style={styles.completedText}>{completedPart}</Text>
              <Text style={styles.currentChar}>{currentChar}</Text>
              <Text style={styles.remainingText}>{remainingPart}</Text>
            </Text>
          </View>
        </ScrollView>
        {settings.showProgress && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              進度: {currentPosition}/{textMapping.totalInputLength} ({Math.round((currentPosition / textMapping.totalInputLength) * 100)}%)
            </Text>
          </View>
        )}
      </View>
    );
  };

  // 渲染遊戲界面
  const renderGameContent = () => {
    switch (gameState) {
      case 'idle':
        return <LongTextGameStartScreen onStart={startGame} settings={settings} />;
      case 'playing':
      case 'paused':
        return (
          <LongTextGamePlayScreen
                    renderTextContent={renderTextContentWithParagraphs}
        userInput={userInput}
        onInputChange={handleInputChange}
        onPause={togglePause}
        isPaused={gameState === 'paused'}
        score={score}
        combo={combo}
        lives={lives}
        gameTime={gameTime}
        errors={errors}
        currentText={currentText}
        currentPosition={currentPosition}
        textMapping={textMapping}
          />
        );
      case 'finished':
        return (
          <LongTextGameEndScreen
            score={score}
            gameTime={gameTime}
            errors={errors}
            currentText={currentText}
            onRestart={startGame}
            onBackToMenu={goBackToMenu}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={LightTheme.primary} />
      {renderGameContent()}
    </SafeAreaView>
  );
};

// 遊戲開始畫面
interface LongTextGameStartScreenProps {
  onStart: () => void;
  settings: LongTextSettings;
}

const LongTextGameStartScreen: React.FC<LongTextGameStartScreenProps> = ({ onStart, settings }) => (
  <View style={styles.centerContainer}>
    <Text style={styles.gameModeTitle}>長文模式</Text>
    <Text style={styles.instructions}>
      完整輸入日文長文來練習打字技巧！
    </Text>
    <View style={styles.settingsInfo}>
      <Text style={styles.settingText}>文章長度：{settings.textLength === 'short' ? '短篇' : '中篇'}</Text>
      <Text style={styles.settingText}>顯示進度：{settings.showProgress ? '是' : '否'}</Text>
    </View>
    <Pressable style={styles.startButton} onPress={onStart}>
      <Text style={styles.startButtonText}>開始遊戲</Text>
    </Pressable>
  </View>
);

// 遊戲進行畫面
interface LongTextGamePlayScreenProps {
  renderTextContent: () => React.ReactNode;
  userInput: string;
  onInputChange: (text: string) => void;
  onPause: () => void;
  isPaused: boolean;
  score: number;
  combo: number;
  lives: number;
  gameTime: number;
  errors: number;
  currentText: LongTextContent | null;
  currentPosition: number;
  textMapping: TextMapping | null;
}

const LongTextGamePlayScreen: React.FC<LongTextGamePlayScreenProps> = ({
  renderTextContent,
  userInput,
  onInputChange,
  onPause,
  isPaused,
  score,
  combo,
  lives,
  gameTime,
  errors,
  currentText,
  currentPosition,
  textMapping,
}) => (
  <View style={styles.gameContainer}>
    {/* 遊戲狀態顯示 */}
    <View style={styles.gameStats}>
      <Text style={styles.statText}>分數: {score}</Text>
      <Text style={styles.statText}>連擊: {combo}</Text>
      <Text style={styles.statText}>❤️ {lives}</Text>
      <Text style={styles.statText}>{Math.floor(gameTime / 60)}:{(gameTime % 60).toString().padStart(2, '0')}</Text>
    </View>

    {isPaused && (
      <View style={styles.pauseOverlay}>
        <Text style={styles.pauseText}>遊戲暫停</Text>
      </View>
    )}

    {/* 文字顯示區域 */}
    {renderTextContent()}

    {/* 輸入區域 */}
    <View style={styles.inputContainer}>
      <TextInput
        style={styles.textInput}
        value={userInput}
        onChangeText={onInputChange}
        placeholder="在這裡輸入文章內容..."
        placeholderTextColor={LightTheme.textSecondary}
        multiline
        autoFocus
        editable={!isPaused}
      />
    </View>

    {/* 輸入進度顯示 */}
    <LongTextInputProgress 
      userInput={userInput} 
      targetChar={textMapping ? getTargetCharAtPosition(textMapping, currentPosition) : ''} 
      validation={textMapping ? validateInputAtPosition(textMapping, userInput, currentPosition) : null}
    />

    {/* 控制按鈕 */}
    <View style={styles.controlsContainer}>
      <Pressable style={styles.pauseButton} onPress={onPause}>
        <Text style={styles.pauseButtonText}>
          {isPaused ? '繼續' : '暫停'}
        </Text>
      </Pressable>
    </View>
  </View>
);

// 輸入進度顯示組件
interface LongTextInputProgressProps {
  userInput: string;
  targetChar: string;
  validation: {
    isValid: boolean;
    isComplete: boolean;
    canContinue: boolean;
    possibleChars: string[];
  } | null;
}

const LongTextInputProgress: React.FC<LongTextInputProgressProps> = ({ userInput, targetChar, validation }) => {
  if (!targetChar) return null;
  
  const isValid = validation ? validation.canContinue : userInput === targetChar;
  const isComplete = validation ? validation.isComplete : userInput === targetChar;
  const possibleChars = validation?.possibleChars || [];
  
  // 判斷輸入狀態
  let inputStatus = 'waiting';
  let statusColor = styles.inputTextError;
  
  if (!userInput) {
    inputStatus = 'waiting';
    statusColor = styles.inputTextError;
  } else if (isComplete) {
    inputStatus = 'complete';
    statusColor = styles.inputTextCorrect;
  } else if (isValid) {
    inputStatus = 'partial';
    statusColor = styles.inputTextPartial;
  } else {
    inputStatus = 'error';
    statusColor = styles.inputTextError;
  }
  
  return (
    <View style={styles.inputProgressContainer}>
      <Text style={styles.inputProgressLabel}>當前輸入：</Text>
      <Text style={[styles.inputProgressText, statusColor]}>
        {userInput || '（等待輸入）'}
      </Text>
      <Text style={styles.targetCharText}>
        目標字符：{targetChar}
      </Text>
      
      {/* 顯示狀態提示 */}
      {inputStatus === 'partial' && (
        <Text style={styles.inputHint}>
          ✓ 可以繼續輸入（支援濁音半濁音轉換）
        </Text>
      )}
      
      {/* 顯示可能的讀音 */}
      {possibleChars.length > 1 && (
        <Text style={styles.inputHint}>
          可接受的讀音: {possibleChars.join(' 或 ')}
        </Text>
      )}
      
      {/* 顯示轉換提示 */}
      {validation && !validation.canContinue && userInput && (
        <Text style={styles.transformationHint}>
          提示：試試濁音半濁音轉換 (如 し→じ, は→ば→ぱ)
        </Text>
      )}
    </View>
  );
};

// 遊戲結束畫面
interface LongTextGameEndScreenProps {
  score: number;
  gameTime: number;
  errors: number;
  currentText: LongTextContent | null;
  onRestart: () => void;
  onBackToMenu: () => void;
}

const LongTextGameEndScreen: React.FC<LongTextGameEndScreenProps> = ({
  score,
  gameTime,
  errors,
  currentText,
  onRestart,
  onBackToMenu,
}) => (
  <View style={styles.centerContainer}>
    <Text style={styles.gameOverTitle}>遊戲結束</Text>
    <View style={styles.finalScoreContainer}>
      <Text style={styles.finalScoreLabel}>最終分數</Text>
      <Text style={styles.finalScoreValue}>{score}</Text>
      <Text style={styles.finalTimeText}>
        用時：{Math.floor(gameTime / 60)}分{gameTime % 60}秒
      </Text>
      <Text style={styles.finalErrorText}>
        錯誤次數：{errors}
      </Text>
      {currentText && (
        <Text style={styles.finalTextText}>
          完成文章：{currentText.title}
        </Text>
      )}
    </View>
    <View style={styles.endButtonsContainer}>
      <Pressable style={styles.restartButton} onPress={onRestart}>
        <Text style={styles.restartButtonText}>再玩一次</Text>
      </Pressable>
      <Pressable style={styles.menuButton} onPress={onBackToMenu}>
        <Text style={styles.menuButtonText}>回到主選單</Text>
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LightTheme.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  gameContainer: {
    flex: 1,
    padding: Spacing.lg,
  },
  gameModeTitle: {
    fontSize: Typography.sizes.ui.title,
    fontWeight: '700',
    color: LightTheme.primary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  instructions: {
    fontSize: Typography.sizes.ui.body,
    color: LightTheme.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: Typography.lineHeights.ui,
  },
  settingsInfo: {
    marginBottom: Spacing.xl,
  },
  settingText: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  startButton: {
    backgroundColor: LightTheme.primary,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  startButtonText: {
    color: 'white',
    fontSize: Typography.sizes.ui.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  gameStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    backgroundColor: LightTheme.surface,
    borderRadius: 12,
    marginBottom: Spacing.lg,
  },
  statText: {
    fontSize: Typography.sizes.ui.caption,
    fontWeight: '600',
    color: LightTheme.text,
  },
  pauseOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  pauseText: {
    fontSize: Typography.sizes.ui.subtitle,
    color: 'white',
    fontWeight: '600',
  },
  textDisplayContainer: {
    flex: 1,
    backgroundColor: LightTheme.surface,
    borderRadius: 16,
    marginVertical: Spacing.lg,
    padding: Spacing.lg,
    marginHorizontal: Spacing.lg,
  },
  textTitle: {
    fontSize: Typography.sizes.ui.subtitle,
    fontWeight: '600',
    color: LightTheme.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  textScrollView: {
    flex: 1,
    width: '100%',
  },
  textScrollContent: {
    paddingBottom: Spacing.lg,
  },
  textContentContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: Spacing.lg,
    flex: 1,
    marginBottom: Spacing.md,
  },
  textContent: {
    fontSize: Typography.sizes.ui.body,
    lineHeight: Typography.lineHeights.ui * 1.8, // 增加行高
    textAlign: 'left',
    width: '100%',
  },
  // 文字包裝容器
  textWrapper: {
    width: '100%',
    paddingHorizontal: Spacing.sm,
  },
  // 新增段落樣式
  paragraphText: {
    fontSize: Typography.sizes.ui.body,
    lineHeight: Typography.lineHeights.ui * 1.8,
    textAlign: 'left',
    width: '100%',
    flexWrap: 'wrap',
  },
  // 行文字樣式
  lineText: {
    fontSize: Typography.sizes.ui.body,
    lineHeight: Typography.lineHeights.ui * 1.8,
    textAlign: 'left',
    marginBottom: Spacing.xs, // 行間距
    color: LightTheme.text, // 確保文字顏色正確
  },
  typedText: {
    color: LightTheme.success,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  currentChar: {
    backgroundColor: LightTheme.accent,
    color: 'white',
  },
  remainingText: {
    color: LightTheme.textSecondary,
  },
  progressContainer: {
    marginTop: Spacing.md,
    alignItems: 'center',
  },
  progressText: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.textSecondary,
  },
  inputContainer: {
    marginVertical: Spacing.lg,
  },
  textInput: {
    backgroundColor: LightTheme.surface,
    borderRadius: 12,
    padding: Spacing.md,
    fontSize: Typography.sizes.ui.body,
    color: LightTheme.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  controlsContainer: {
    alignItems: 'center',
    marginTop: Spacing.lg,
  },
  pauseButton: {
    backgroundColor: LightTheme.secondary,
    borderRadius: 12,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  pauseButtonText: {
    color: 'white',
    fontSize: Typography.sizes.ui.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  gameOverTitle: {
    fontSize: Typography.sizes.ui.title,
    fontWeight: '700',
    color: LightTheme.text,
    marginBottom: Spacing.lg,
  },
  finalScoreContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  finalScoreLabel: {
    fontSize: Typography.sizes.ui.body,
    color: LightTheme.textSecondary,
    marginBottom: Spacing.xs,
  },
  finalScoreValue: {
    fontSize: 48,
    fontWeight: '700',
    color: LightTheme.primary,
    marginBottom: Spacing.sm,
  },
  finalTimeText: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.textSecondary,
    marginBottom: Spacing.xs,
  },
  finalErrorText: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.textSecondary,
    marginBottom: Spacing.xs,
  },
  finalTextText: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.textSecondary,
  },
  endButtonsContainer: {
    gap: Spacing.md,
  },
  restartButton: {
    backgroundColor: LightTheme.primary,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  restartButtonText: {
    color: 'white',
    fontSize: Typography.sizes.ui.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  menuButton: {
    backgroundColor: LightTheme.surface,
    borderRadius: 12,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  menuButtonText: {
    color: LightTheme.text,
    fontSize: Typography.sizes.ui.body,
    fontWeight: '600',
    textAlign: 'center',
  },
  simpleText: {
    fontSize: Typography.sizes.ui.body,
    lineHeight: Typography.sizes.ui.body * 2.5, // 使用字體大小的2.5倍作為行高
    textAlign: 'left',
    width: '100%',
    color: LightTheme.text, // 確保文字顏色正確
  },
  completedText: {
    color: LightTheme.success,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  inputProgressContainer: {
    marginVertical: Spacing.lg,
  },
  inputProgressLabel: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.textSecondary,
    marginBottom: Spacing.xs,
  },
  inputProgressText: {
    fontSize: Typography.sizes.ui.body,
    color: LightTheme.text,
  },
  inputTextCorrect: {
    color: LightTheme.success,
  },
  inputTextPartial: {
    color: LightTheme.accent,
  },
  inputTextError: {
    color: LightTheme.error,
  },
  targetCharText: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.textSecondary,
    marginBottom: Spacing.xs,
  },
  inputHint: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.textSecondary,
    marginBottom: Spacing.xs,
  },
  transformationHint: {
    fontSize: Typography.sizes.ui.caption,
    color: LightTheme.accent,
    marginTop: Spacing.xs,
    fontStyle: 'italic',
  },
}); 