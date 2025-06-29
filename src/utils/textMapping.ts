/**
 * 文本映射工具
 * 處理顯示文本（漢字）和輸入文本（假名）之間的字符對應關係
 */

import { generateReadingVariations, getPossibleReadings } from './multipleReadings';
import { isKanji, getKanaReading, hasKanaReading } from './kanjiToKanaMapping';
import { validateJapaneseInput } from './japaneseInput';

/**
 * 字符映射信息
 */
export interface CharacterMapping {
  displayIndex: number;    // 在顯示文本中的索引
  inputIndex: number;      // 在輸入文本中的索引
  displayChar: string;     // 顯示字符
  inputChar: string;       // 輸入字符
  isKanji: boolean;        // 是否為漢字
  kanjiWord?: string;      // 如果是漢字，所屬的詞彙
  readingVariations?: string[]; // 可能的讀音變體
}

/**
 * 文本映射結果
 */
export interface TextMapping {
  displayText: string;
  inputText: string;
  mappings: CharacterMapping[];
  totalInputLength: number;
}

/**
 * 創建顯示文本和輸入文本之間的映射
 */
export const createTextMapping = (displayText: string, inputText: string): TextMapping => {
  const mappings: CharacterMapping[] = [];
  let displayIndex = 0;
  let inputIndex = 0;

  while (displayIndex < displayText.length && inputIndex < inputText.length) {
    const displayChar = displayText[displayIndex];
    
    // 首先檢查是否為複合詞的開始
    let foundCompoundWord = false;
    
    // 檢查從當前位置開始的所有可能的複合詞
    for (let wordLength = Math.min(10, displayText.length - displayIndex); wordLength >= 2; wordLength--) {
      const potentialWord = displayText.substring(displayIndex, displayIndex + wordLength);
      const wordReading = getKanaReading(potentialWord);
      
      if (wordReading && inputText.substring(inputIndex, inputIndex + wordReading.length) === wordReading) {
        // 找到匹配的複合詞
        let currentInputIndex = inputIndex;
        
        for (let i = 0; i < wordLength; i++) {
          const currentDisplayChar = displayText[displayIndex + i];
          
          if (isKanji(currentDisplayChar)) {
            // 對於漢字，需要找到它在複合詞中的讀音部分
            const singleCharReading = getKanaReading(currentDisplayChar);
            let charReadingLength = 1; // 默認長度
            
            if (singleCharReading) {
              charReadingLength = singleCharReading.length;
            } else {
              // 如果單個字符沒有讀音，嘗試從複合詞讀音中推斷
              // 這是一個簡化的處理，實際情況可能更複雜
              const remainingChars = wordLength - i;
              const remainingReading = wordReading.substring(currentInputIndex - inputIndex);
              charReadingLength = Math.max(1, Math.floor(remainingReading.length / remainingChars));
            }
            
            // 為這個漢字的每個假名字符創建映射
            for (let j = 0; j < charReadingLength; j++) {
              if (currentInputIndex + j < inputText.length) {
                mappings.push({
                  displayIndex: displayIndex + i,
                  inputIndex: currentInputIndex + j,
                  displayChar: currentDisplayChar,
                  inputChar: inputText[currentInputIndex + j],
                  isKanji: true,
                  kanjiWord: potentialWord, // 使用完整的複合詞
                });
              }
            }
            currentInputIndex += charReadingLength;
          } else {
            // 非漢字字符，一對一映射
            mappings.push({
              displayIndex: displayIndex + i,
              inputIndex: currentInputIndex,
              displayChar: currentDisplayChar,
              inputChar: inputText[currentInputIndex],
              isKanji: false,
              kanjiWord: potentialWord,
            });
            currentInputIndex++;
          }
        }
        
        inputIndex = currentInputIndex;
        
        displayIndex += wordLength;
        foundCompoundWord = true;
        break;
      }
    }
    
    if (!foundCompoundWord) {
      // 檢查是否為單個漢字
      const isKanjiChar = isKanji(displayChar);
      
      if (isKanjiChar && hasKanaReading(displayChar)) {
        // 漢字字符：映射到對應的假名序列
        const kanaReading = getKanaReading(displayChar);
        if (kanaReading) {
          // 為這個漢字的每個假名字符創建映射
          for (let i = 0; i < kanaReading.length; i++) {
            if (inputIndex + i < inputText.length) {
              mappings.push({
                displayIndex,
                inputIndex: inputIndex + i,
                displayChar,
                inputChar: inputText[inputIndex + i],
                isKanji: true,
                kanjiWord: displayChar,
              });
            }
          }
          inputIndex += kanaReading.length;
        } else {
          // 未知漢字，按一對一處理
          mappings.push({
            displayIndex,
            inputIndex,
            displayChar,
            inputChar: inputText[inputIndex],
            isKanji: true,
          });
          inputIndex++;
        }
      } else {
        // 非漢字字符（假名、標點等）：一對一映射
        mappings.push({
          displayIndex,
          inputIndex,
          displayChar,
          inputChar: inputText[inputIndex],
          isKanji: false,
        });
        inputIndex++;
      }
      
      displayIndex++;
    }
  }

  return {
    displayText,
    inputText,
    mappings,
    totalInputLength: inputText.length,
  };
};

/**
 * 根據輸入位置獲取對應的顯示位置
 */
export const getDisplayPositionFromInput = (mapping: TextMapping, inputPosition: number): number => {
  if (inputPosition >= mapping.mappings.length) {
    return mapping.displayText.length;
  }
  
  return mapping.mappings[inputPosition]?.displayIndex || 0;
};

/**
 * 根據顯示位置獲取對應的輸入位置
 */
export const getInputPositionFromDisplay = (mapping: TextMapping, displayPosition: number): number => {
  const mapping_item = mapping.mappings.find(m => m.displayIndex === displayPosition);
  return mapping_item?.inputIndex || 0;
};

/**
 * 獲取當前輸入位置的目標字符
 */
export const getTargetCharAtPosition = (mapping: TextMapping, inputPosition: number): string => {
  if (inputPosition >= mapping.mappings.length) {
    return '';
  }
  
  return mapping.mappings[inputPosition]?.inputChar || '';
};

/**
 * 分割文本用於顯示（基於輸入進度）
 */
export const splitTextForDisplay = (
  mapping: TextMapping, 
  currentInputPosition: number
): {
  completedPart: string;
  currentChar: string;
  remainingPart: string;
} => {
  // 找到當前輸入位置對應的顯示字符
  const currentMapping = mapping.mappings.find(m => m.inputIndex === currentInputPosition);
  
  if (!currentMapping) {
    // 已完成所有輸入
    return {
      completedPart: mapping.displayText,
      currentChar: '',
      remainingPart: '',
    };
  }
  
  const displayPosition = currentMapping.displayIndex;
  const currentDisplayChar = currentMapping.displayChar;
  
  if (currentMapping.isKanji) {
    // 對於漢字，在整個讀音輸入完成之前都保持高亮
    // 找到這個漢字對應的所有假名映射
    const kanjiMappings = mapping.mappings.filter(m => 
      m.displayIndex === displayPosition && m.isKanji
    );
    
    // 檢查是否還在輸入這個漢字的讀音
    const isStillInputtingKanji = kanjiMappings.some(m => m.inputIndex >= currentInputPosition);
    
    if (isStillInputtingKanji) {
      // 仍在輸入這個漢字的讀音，保持高亮
      return {
        completedPart: mapping.displayText.substring(0, displayPosition),
        currentChar: currentDisplayChar,
        remainingPart: mapping.displayText.substring(displayPosition + 1),
      };
    } else {
      // 這個漢字的讀音已經輸入完成，移到已完成部分
      return {
        completedPart: mapping.displayText.substring(0, displayPosition + 1),
        currentChar: '',
        remainingPart: mapping.displayText.substring(displayPosition + 1),
      };
    }
  } else {
    // 非漢字字符，正常處理
    return {
      completedPart: mapping.displayText.substring(0, displayPosition),
      currentChar: currentDisplayChar,
      remainingPart: mapping.displayText.substring(displayPosition + 1),
    };
  }
};

/**
 * 高級文本映射：支援多讀音
 */
export const createAdvancedTextMapping = (
  displayText: string, 
  baseInputText: string
): TextMapping => {
  // 生成所有可能的讀音變體
  const readingVariations = generateReadingVariations(displayText, baseInputText);
  
  // 使用基本讀音創建映射
  const baseMapping = createTextMapping(displayText, baseInputText);
  
  // 為每個映射添加讀音變體信息
  baseMapping.mappings.forEach((mapping, index) => {
    if (mapping.isKanji) {
      // 為漢字字符添加可能的讀音變體
      mapping.readingVariations = readingVariations.map(variation => variation[index]).filter(Boolean);
    }
  });
  
  return baseMapping;
};

/**
 * 驗證用戶輸入是否匹配當前位置（支援多讀音和濁音半濁音轉換）
 */
export const validateInputAtPosition = (
  mapping: TextMapping,
  userInput: string,
  inputPosition: number
): {
  isValid: boolean;
  isComplete: boolean;
  canContinue: boolean;
  possibleChars: string[];
} => {
  if (inputPosition >= mapping.mappings.length) {
    return {
      isValid: false,
      isComplete: false,
      canContinue: false,
      possibleChars: [],
    };
  }
  
  const targetMapping = mapping.mappings[inputPosition];
  const targetChar = targetMapping.inputChar;
  let possibleChars = [targetChar];
  
  // 如果是漢字，檢查是否有多種讀音
  if (targetMapping.isKanji && targetMapping.kanjiWord) {
    const alternativeReadings = getPossibleReadings(targetMapping.kanjiWord);
    if (alternativeReadings.length > 0) {
      // 找到當前字符在漢字讀音中的位置
      const kanjiMappings = mapping.mappings.filter(m => 
        m.displayIndex === targetMapping.displayIndex && m.isKanji
      );
      const charPositionInKanji = kanjiMappings.findIndex(m => m.inputIndex === inputPosition);
      
      // 為每種讀音添加對應位置的字符
      alternativeReadings.forEach(reading => {
        if (charPositionInKanji < reading.length) {
          possibleChars.push(reading[charPositionInKanji]);
        }
      });
    }
  }
  
  // 如果有讀音變體，添加到可能字符中
  if (targetMapping.readingVariations) {
    possibleChars.push(...targetMapping.readingVariations);
  }
  
  possibleChars = Array.from(new Set(possibleChars));
  
  // 使用高級日文輸入驗證（支援濁音半濁音轉換）
  const japaneseValidation = validateJapaneseInput(userInput, targetChar);
  
  // 添加調試信息
  console.log(`[textMapping調試] validateJapaneseInput("${userInput}", "${targetChar}"):`, {
    isValid: japaneseValidation.isValid,
    isComplete: japaneseValidation.isComplete,
    canContinue: japaneseValidation.canContinue,
    confidence: japaneseValidation.confidence,
    hint: japaneseValidation.hint
  });
  
  // 檢查是否通過基本匹配
  const isValidBasic = possibleChars.includes(userInput);
  
  // 檢查是否通過高級日文驗證（包括三段式輸入）
  const isValidAdvanced = japaneseValidation.isValid;
  
  console.log(`[textMapping調試] 匹配檢查:`, {
    isValidBasic,
    isValidAdvanced,
    possibleChars
  });
  
  // 總體有效性：基本匹配或高級驗證通過
  const isValid = isValidBasic || isValidAdvanced;
  
  // 完成條件：
  // 1. 完全匹配目標字符，或
  // 2. 通過高級驗證且標記為完成
  const isComplete = (userInput === targetChar) || 
                    (japaneseValidation.isComplete && japaneseValidation.isValid);
  
  // 可以繼續的條件：
  // 1. 基本匹配但未完成，或
  // 2. 高級驗證通過且可以繼續（支援三段式輸入）
  const canContinue = (isValidBasic && !isComplete) || 
                     (japaneseValidation.isValid && japaneseValidation.canContinue);
  
  console.log(`[textMapping調試] 最終結果:`, {
    isValid,
    isComplete,
    canContinue
  });
  
  // 收集所有可能的字符
  let allPossibleChars = [...possibleChars];
  
  // 如果高級驗證提供了下一個可能字符，添加到列表中
  if (japaneseValidation.nextPossibleChars) {
    allPossibleChars.push(...japaneseValidation.nextPossibleChars);
  }
  
  // 如果是三段式輸入的中間狀態，添加轉換提示
  if (japaneseValidation.transformationPath && japaneseValidation.transformationPath.length > 2) {
    // 這是三段式轉換，添加所有可能的轉換字符
    allPossibleChars.push(...japaneseValidation.transformationPath);
  }
  
  allPossibleChars = Array.from(new Set(allPossibleChars));
  
  return {
    isValid,
    isComplete,
    canContinue,
    possibleChars: allPossibleChars,
  };
}; 