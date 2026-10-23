import React, { useState } from 'react';
import { Delete, Lock } from 'lucide-react';

interface PinKeypadProps {
    onComplete: (pin: string) => void;
    onForgotPin?: () => void;
    title: string;
    error?: string;
}

export const PinKeypad: React.FC<PinKeypadProps> = ({ onComplete, onForgotPin, title, error }) => {
    const [pin, setPin] = useState('');

    const handlePress = (num: string) => {
        if (pin.length < 4) {
            const newPin = pin + num;
            setPin(newPin);
            if (newPin.length === 4) {
                onComplete(newPin);
                // We don't reset immediately to show the 4th dot for a moment
                setTimeout(() => setPin(''), 500);
            }
        }
    };

    const handleDelete = () => {
        setPin(pin.slice(0, -1));
    };

    return (
        <div className="flex flex-col items-center justify-center space-y-10 py-8">
            <div className="text-center space-y-3">
                <div className="w-14 h-14 bg-gradient-to-br from-[#2D6E3E] to-[#1F5A30] rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-[#2D6E3E]/20 text-white">
                    <Lock size={24} />
                </div>
                <h2 className="text-xl font-bold tracking-tight text-[#111612]">{title}</h2>
                {error && <p className="text-rose-500 text-xs font-semibold">{error}</p>}
            </div>

            {/* Dots */}
            <div className="flex space-x-5">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className={`w-3.5 h-3.5 rounded-full border-2 transition-[transform,background-color,border-color] duration-150 will-change-transform ${
                            pin.length >= i ? 'border-[#2D6E3E] bg-[#2D6E3E] scale-110' : 'border-[rgba(15,20,16,0.2)] bg-transparent'
                        }`}
                    />
                ))}
            </div>

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-5">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                        key={num}
                        onClick={() => handlePress(num.toString())}
                        className="w-18 h-18 rounded-full bg-white/90 backdrop-blur-md text-2xl font-semibold text-[#111612] shadow-xs border border-[rgba(15,20,16,0.08)] active:bg-[#2D6E3E] active:text-white active:scale-95 transition-[transform,background-color,color] duration-150 will-change-transform flex items-center justify-center"
                    >
                        {num}
                    </button>
                ))}
                <div />
                <button
                    onClick={() => handlePress('0')}
                    className="w-18 h-18 rounded-full bg-white/90 backdrop-blur-md text-2xl font-semibold text-[#111612] shadow-xs border border-[rgba(15,20,16,0.08)] active:bg-[#2D6E3E] active:text-white active:scale-95 transition-[transform,background-color,color] duration-150 will-change-transform flex items-center justify-center"
                >
                    0
                </button>
                <button
                    onClick={handleDelete}
                    className="w-18 h-18 rounded-full bg-[#F5F7F5] text-[#737D75] flex items-center justify-center active:scale-90 transition-transform duration-150 will-change-transform border border-[rgba(15,20,16,0.06)]"
                >
                    <Delete size={22} />
                </button>
            </div>
            
            {onForgotPin && (
                <button 
                    onClick={onForgotPin}
                    className="text-xs font-semibold text-[#737D75] hover:text-[#2D6E3E] transition-colors"
                >
                    Esdan chiqardim / Qayta tiklash
                </button>
            )}
        </div>
    );
};
