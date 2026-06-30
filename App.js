import React, { useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  StyleSheet, 
  Text, 
  View, 
  Image, 
  ScrollView, 
  TouchableOpacity, 
  SafeAreaView, 
  FlatList, 
  TextInput,
  Modal,
  ActivityIndicator, 
  Alert,
  Dimensions // <--- Adicionado aqui
} from 'react-native';


// Navegação
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Ícones
import { 
  ClipboardList, 
  Trophy, 
  Shuffle, 
  BookOpen, 
  CloudUpload, 
  Save, 
  UserPlus, 
  Users 
} from 'lucide-react-native';

// Configuração do Banco
import { supabase } from './supabase';

// Bibliotecas de Imagem e Upload
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- COMPONENTE DA TELA DE CHAMADA ---
function ChamadaScreen() {
  const [membros, setMembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [novoNome, setNovoNome] = useState('');
  const [modalVisivel, setModalVisivel] = useState(false);
  const [membroSelecionado, setMembroSelecionado] = useState(null);
  const [valorRetirar, setValorRetirar] = useState('');

  const membrosRef = useRef(membros);

  useEffect(() => {
    membrosRef.current = membros;
  }, [membros]);

  const fetchMembros = async () => {
    setLoading(true);
    try {
      // Buscamos o nome e a avatar_url (que é o que temos no banco)
      const { data, error } = await supabase.from('membros').select('nome, avatar_url').order('nome');
      if (error) throw error;
      
      const listaFormatada = data.map((m) => ({
        nome: m.nome,
        avatar_url: m.avatar_url,
        vis: false, vol: false, pre: false, pon: false, din: false
      }));
      setMembros(listaFormatada);
    } catch (error) {
      console.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMembros(); }, []);

  const togglePonto = (nome, campo) => {
    setMembros(prev => prev.map(m => m.nome === nome ? { ...m, [campo]: !m[campo] } : m));
  };

  const adicionarMembroManual = async () => {
    if (novoNome.trim() === '') return;
    
    try {
      // 1. Envia para o Supabase primeiro
      const { error } = await supabase
        .from('membros')
        .insert([{ nome: novoNome, pontos: 0 }]);

      if (error) throw error;

      // 2. Se salvou no banco, adiciona na lista da tela
      const novo = { nome: novoNome, vis: false, vol: false, pre: false, pon: false, din: false };
      setMembros([novo, ...membros]);
      setNovoNome('');
      Alert.alert("Sucesso", `${novoNome} adicionado ao banco!`);
    } catch (error) {
      Alert.alert("Erro", "Não foi possível salvar o novo membro no servidor.");
      console.error(error);
    }
  };

  // --- FUNÇÃO QUE SALVA A RETIRADA NO BANCO DE DADOS ---
 const executarRetiradaDinamica = async (membroOriginal, valorParaSubtrair) => {
  try {
    // 1. Busca o valor fresquinho direto do banco de dados agora
    const { data, error: fetchError } = await supabase
      .from('membros')
      .select('pontos')
      .eq('nome', membroOriginal.nome)
      .single();

    if (fetchError || !data) throw new Error("Erro ao buscar pontos reais");

    const pontosReais = Number(data.pontos);
    const novoTotal = pontosReais >= valorParaSubtrair ? pontosReais - valorParaSubtrair : 0;

    

    // 2. Agora sim, atualiza com o valor garantido
    const { error: updateError } = await supabase
      .from('membros')
      .update({ pontos: novoTotal })
      .eq('nome', membroOriginal.nome);

    if (updateError) throw updateError;

    // 3. Atualiza a tela
    setMembros(prev => prev.map(m => 
      m.nome === membroOriginal.nome ? { ...m, pontos: novoTotal } : m
    ));

    Alert.alert("Sucesso", "Pontos retirados com precisão!");
  } catch (err) {
    Alert.alert("Erro Crítico", err.message);
  }
};


  const mostrarOpcoesMembro = (membro) => {
  Alert.alert(
    "Gerenciar " + membro.nome,
    "Escolha uma ação:",
    [
      { text: "Cancelar", style: "cancel" },
      { 
        text: "🔢 Retirar Pontos", 
        onPress: () => {
          setMembroSelecionado(membro);
          setModalVisivel(true); // Abre a janelinha de digitar
        } 
      },
      { 
        text: "🗑️ Excluir Permanente", 
        style: "destructive", 
        onPress: () => confirmarExclusao(membro.nome) 
      }
    ]
  );
};

const confirmarRetiradaModal = () => {
  const num = parseInt(valorRetirar);
  if (!isNaN(num) && num > 0) {
    executarRetiradaDinamica(membroSelecionado, num);
    setModalVisivel(false);
    setValorRetirar('');
  } else {
    Alert.alert("Erro", "Digite um número válido.");
  }
};


const confirmarExclusao = async (nome) => {
  try {
    const { error } = await supabase.from('membros').delete().eq('nome', nome);
    if (error) throw error;
    setMembros(prev => prev.filter(m => m.nome !== nome));
    Alert.alert("Sucesso", "Membro removido do servidor.");
  } catch (error) {
    Alert.alert("Erro", "Não foi possível remover.");
  }
};



// 🔻 NOVA FUNÇÃO - DIMINUIR 5 PONTOS
const diminuirPontos = async (membroOriginal) => {
  try {
    // BUSCA O VALOR REAL NA LISTA ATUALIZADA (Evita o log de "Antes: 0")
    setMembros(listaAtual => {
      const membroNaLista = listaAtual.find(m => m.nome === membroOriginal.nome);
      const pontosAtuais = Number(membroNaLista?.pontos) || 0;
      
      const novoTotal = pontosAtuais >= 5 ? pontosAtuais - 5 : 0;

      // Dispara a atualização no Supabase de forma independente
      atualizarBanco(membroOriginal.nome, novoTotal);

      // Retorna a lista para atualizar a tela
      return listaAtual.map(m =>
        m.nome === membroOriginal.nome ? { ...m, pontos: novoTotal } : m
      );
    });
  } catch (error) {
    console.error(error);
  }
};
   
  const salvarSincronizar = async () => {
  setLoading(true);
  
  // 1. Preparamos os dados para salvar
  const dadosParaSalvar = membros.map(m => ({
    nome: m.nome,
    pontos: (m.vis ? 20 : 0) + (m.vol ? 10 : 0) + (m.pre ? 5 : 0) + (m.pon ? 3 : 0) + (m.din ? 2 : 0)
  }));

  try {
    // 2. SALVAMENTO LOCAL (O "Seguro Morreu de Velho")
    await AsyncStorage.setItem('@cache_chamada', JSON.stringify(dadosParaSalvar));
    

    // 3. SINCRONIZAÇÃO COM SUPABASE (AGORA SOMANDO PONTOS)
    for (const m of dadosParaSalvar) {

      // 🔎 Busca os pontos atuais no banco
      const { data, error: fetchError } = await supabase
        .from('membros')
        .select('pontos')
        .eq('nome', m.nome)
        .single();

      if (fetchError) throw fetchError;

      const pontosAtuais = data?.pontos || 0;
      const novosPontos = pontosAtuais + m.pontos;

      // 🔄 Atualiza somando
      const { error: updateError } = await supabase
        .from('membros')
        .update({ pontos: novosPontos })
        .eq('nome', m.nome);

      if (updateError) throw updateError;
    }

    // 4. SE DEU TUDO CERTO
    await AsyncStorage.removeItem('@cache_chamada');
    alert('Sincronizado com sucesso! O notebook já pode ler.');

  } catch (error) {
    console.error("Erro na sincronização:", error);
    alert('Sem conexão ou erro técnico! Os dados estão salvos NO CELULAR. Quando tiver internet, tente salvar novamente.');
  } finally {
    setLoading(false);
  }
};

const calcularTotal = (m) => 
  (m.vis ? 20 : 0) + 
  (m.vol ? 10 : 0) + 
  (m.pre ? 5 : 0) + 
  (m.pon ? 3 : 0) + 
  (m.din ? 2 : 0);

const totalPresentes = membros.filter(m => m.pre).length;
const totalPontosDia = membros.reduce((acc, m) => acc + calcularTotal(m), 0);

  const novoDia = () => {
  setMembros(prevMembros =>
    prevMembros.map(membro => ({
      ...membro,
      vis: false,
      vol: false,
      pre: false,
      pon: false,
      din: false
    }))
  );
};

  const alterarFoto = async (nomeMembro) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert("Acesso Negado", "Precisamos de permissão para acessar suas fotos.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled) {
      try {
        const { base64 } = result.assets[0];
        // Criamos o nome do arquivo usando o nome do membro (limpando espaços)
        const fileName = `avatar_${nomeMembro.replace(/\s/g, '_')}_${Date.now()}.jpg`;

        const { data, error: uploadError } = await supabase.storage
          .from('fotos-membros')
          .upload(fileName, decode(base64), { 
            contentType: 'image/jpeg',
            upsert: true 
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('fotos-membros')
          .getPublicUrl(fileName);

        const publicUrl = urlData.publicUrl;

        // ATENÇÃO: Aqui usamos o NOME para identificar quem atualizar no banco
        const { error: updateError } = await supabase
          .from('membros')
          .update({ avatar_url: publicUrl })
          .eq('nome', nomeMembro);

        if (updateError) throw updateError;

        Alert.alert("Sucesso!", "Foto atualizada!");
        fetchMembros(); 
      } catch (error) {
        console.error(error);
        Alert.alert("Erro", "Não foi possível carregar a foto.");
      }
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }}>
        
        <View style={styles.header}>
          <Image source={require('./assets/logo_pg.png')} style={styles.logo} />
          <View style={styles.headerTexts}>
            <Text style={styles.headerTitle}>PG CONEXÃO JOVEM</Text>
            <Text style={styles.headerSub}>BUSCAR, RESGATAR, AMAR E ACOLHER</Text>
          </View>
          <Image 
            source={require('./assets/cruz.png')} 
            style={{ width: 65, height: 65, resizeMode: 'contain', marginLeft: 'auto' }} 
          />
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginBottom: 15 }}>
          <TextInput 
            placeholder="Novo membro ou convidado..." 
            placeholderTextColor="#94a3b8"
            value={novoNome}
            onChangeText={setNovoNome}
            style={{ flex: 1, backgroundColor: '#0f172a', color: '#fff', borderRadius: 10, paddingHorizontal: 15, height: 50, borderWidth: 1, borderColor: '#1e293b' }}
          />
          <TouchableOpacity onPress={adicionarMembroManual} style={{ backgroundColor: '#22c55e', width: 60, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}>
             <UserPlus color="#fff" size={20} />
          </TouchableOpacity>
        </View>

        <View style={{flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10}}>
           <Text style={styles.sectionTitle}>LISTA DE MEMBROS</Text>
           <TouchableOpacity onPress={novoDia}><Text style={{color: '#38bdf8', fontSize: 12}}>Limpar Tudo</Text></TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.tableHeader}>
              <Text style={[styles.col, { width: 140 }]}>NOME</Text>
              <Text style={[styles.colHeader, { width: 85 }]}>VISITANTE{"\n"}<Text style={{color: '#f97316'}}>+20</Text></Text>
              <Text style={[styles.colHeader, { width: 85 }]}>VOLTOU{"\n"}<Text style={{color: '#22c55e'}}>+10</Text></Text>
              <Text style={[styles.colHeader, { width: 85 }]}>PRESENÇA{"\n"}<Text style={{color: '#3b82f6'}}>+5</Text></Text>
              <Text style={[styles.colHeader, { width: 85 }]}>PONTUAL{"\n"}<Text style={{color: '#eab308'}}>+3</Text></Text>
              <Text style={[styles.colHeader, { width: 85 }]}>DINÂMICA{"\n"}<Text style={{color: '#a855f7'}}>+2</Text></Text>
              <Text style={[styles.col, { color: '#22c55e', width: 60 }]}>TOTAL</Text>
              <Text style={[styles.col, { width: 40 }]}></Text>
            </View>

            {membros.map((m, index) => (
              <View key={m.nome} style={[styles.tableRow, index % 2 === 0 && {backgroundColor: '#0f172a'}]}>
                
                <TouchableOpacity 
                  onPress={() => alterarFoto(m.nome)} 
                  style={{ flexDirection: 'row', alignItems: 'center', width: 140 }}
                >
                  <View style={styles.avatarContainer}>
                    {m.avatar_url ? (
                      <Image source={{ uri: m.avatar_url }} style={styles.avatarImage} />
                    ) : (
                      <Text style={{ color: '#fff', fontSize: 10 }}>📷</Text>
                    )}
                  </View>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 13, flex: 1 }} numberOfLines={1}>
                    {m.nome}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity onPress={() => togglePonto(m.nome, 'vis')} style={[styles.checkCell, { width: 85 }]}>
                  <View style={[styles.check, { borderColor: '#f97316' }, m.vis && {backgroundColor: '#f97316'}]} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => togglePonto(m.nome, 'vol')} style={[styles.checkCell, { width: 85 }]}>
                  <View style={[styles.check, { borderColor: '#22c55e' }, m.vol && {backgroundColor: '#22c55e'}]} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => togglePonto(m.nome, 'pre')} style={[styles.checkCell, { width: 85 }]}>
                  <View style={[styles.check, { borderColor: '#3b82f6' }, m.pre && {backgroundColor: '#3b82f6'}]} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => togglePonto(m.nome, 'pon')} style={[styles.checkCell, { width: 85 }]}>
                  <View style={[styles.check, { borderColor: '#eab308' }, m.pon && {backgroundColor: '#eab308'}]} />
                </TouchableOpacity>

                <TouchableOpacity onPress={() => togglePonto(m.nome, 'din')} style={[styles.checkCell, { width: 85 }]}>
                  <View style={[styles.check, { borderColor: '#a855f7' }, m.din && {backgroundColor: '#a855f7'}]} />
                </TouchableOpacity>

                <Text style={[styles.cell, { color: '#22c55e', width: 60, fontWeight: 'bold' }]}>{calcularTotal(m)}</Text>
                
                <View style={{ flexDirection: 'row', alignItems: 'center', width: 70, justifyContent: 'space-between' }}>
  
  <TouchableOpacity 
  onPress={() => mostrarOpcoesMembro(m)} 
  style={{ width: 50, alignItems: 'center', justifyContent: 'center' }}
>
  <Text style={{ color: '#ef4444', fontSize: 28, fontWeight: 'bold' }}>
    ×
  </Text>
</TouchableOpacity>



</View>
              </View>
            ))}
          </View>
        </ScrollView>

        <View style={styles.statsRow}>
           <View style={styles.statBox}><Text style={styles.statVal}>{totalPresentes}</Text><Text style={styles.statLabel}>PRESENTES</Text></View>
           <View style={styles.statBox}><Text style={styles.statVal}>{totalPontosDia}</Text><Text style={styles.statLabel}>PONTOS DIA</Text></View>
        </View>

<TouchableOpacity
  onPress={novoDia}
  style={{
    width: '90%',
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    backgroundColor: '#f59e0b',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  }}
>
  <Text style={{ color: '#fff', fontWeight: 'bold' }}>
    NOVO DIA
  </Text>
</TouchableOpacity>

        <TouchableOpacity 
  onPress={salvarSincronizar} 
  style={[
    styles.floatBtnUpdate, 
    {
      width: '90%', 
      position: 'absolute', // Muda de relative para absolute
      bottom: 20,           // Fixa ele no fundo da tela
      alignSelf: 'center',
      marginTop: 0          // Remove o marginTop que estava criando o "vão"
    }
  ]}
>
  {loading ? (
    <ActivityIndicator color="#fff" />
  ) : (
    <>
      <Save size={24} color="#fff" />
      <Text style={{color: '#fff', fontWeight: 'bold', marginLeft: 10}}>
        SALVAR E SINCRONIZAR
      </Text>
    </>
  )}
</TouchableOpacity>
<Modal visible={modalVisivel} transparent animationType="fade">
  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }}>
    <View style={{ backgroundColor: '#1e293b', padding: 25, borderRadius: 20, width: '80%', borderWidth: 1, borderColor: '#334155' }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>Retirar Pontos</Text>
      <Text style={{ color: '#94a3b8', marginBottom: 10 }}>Quantos pontos tirar de {membroSelecionado?.nome}?</Text>
      
      <TextInput
        style={{ backgroundColor: '#0f172a', color: '#fff', padding: 15, borderRadius: 10, fontSize: 20, textAlign: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#38bdf8' }}
        placeholder="0"
        placeholderTextColor="#475569"
        keyboardType="numeric"
        value={valorRetirar}
        onChangeText={setValorRetirar}
        autoFocus
      />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <TouchableOpacity onPress={() => setModalVisivel(false)} style={{ padding: 10 }}>
          <Text style={{ color: '#94a3b8', fontWeight: 'bold' }}>CANCELAR</Text>
        </TouchableOpacity>
        
        <TouchableOpacity onPress={confirmarRetiradaModal} style={{ backgroundColor: '#38bdf8', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}>
          <Text style={{ color: '#000', fontWeight: 'bold' }}>CONFIRMAR</Text>
        </TouchableOpacity>
      </View>
    </View>
  </View>
</Modal>
      </ScrollView>
    </SafeAreaView>
  );
}
// --- TELA DE RANKING (PÓDIO) ---
function RankingScreen() {
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRanking = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('membros')
        .select('nome, pontos, avatar_url')
        .order('pontos', { ascending: false });

      if (error) throw error;
      if (data) setRanking(data);
    } catch (err) {
      console.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRanking(); }, []);

  const top3 = ranking.slice(0, 3);
  const demais = ranking.slice(3);

 const renderAvatar = (item, size, fontSize) => {
  if (!item) return null;

  return (
    <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
      {item.avatar_url ? (
        <Image 
          source={{ uri: item.avatar_url }} 
          style={styles.avatarImage} 
          key={item.avatar_url} // Força atualização quando a foto mudar
        />
      ) : (
        <Text style={{ color: '#fff', fontSize: fontSize, fontWeight: 'bold' }}>
          {item.nome?.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
};

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }}>
        
        <View style={styles.header}>
          <Image source={require('./assets/logo_pg.png')} style={styles.logo} />
          <View style={styles.headerTexts}>
            <Text style={styles.headerTitle}>RANKING GERAL</Text>
            <Text style={styles.headerSub}>OS MELHORES DO PG CONEXÃO</Text>
          </View>
          <Image source={require('./assets/cruz.png')} style={{ width: 65, height: 65, resizeMode: 'contain', marginLeft: 'auto' }} />
        </View>

        {/* PÓDIO - Agora com os estilos certos para mostrar pontos e medalhas */}
<View style={styles.podiumContainer}>
  
  {/* 2º LUGAR */}
  <View style={styles.podiumItem}>
    <View style={[styles.circlePodium, { borderColor: '#94a3b8', marginTop: 40 }]}>
      <View style={styles.avatarClip}>
        {renderAvatar(top3[1], 84, 30)}
      </View>
      <View style={styles.medalSilver}><Text style={{fontSize: 14}}>🥈</Text></View>
    </View>
    <Text style={styles.podiumName}>{top3[1]?.nome || '-'}</Text>
    <Text style={styles.podiumPoints}>{top3[1]?.pontos || 0} pts</Text>
  </View>

  {/* 1º LUGAR */}
  <View style={styles.podiumItem}>
    <View style={[styles.circlePodium, { borderColor: '#eab308', width: 110, height: 110, borderRadius: 55 }]}>
      <View style={styles.avatarClip}>
        {renderAvatar(top3[0], 104, 40)}
      </View>
      <View style={styles.medalGold}><Text style={{fontSize: 18}}>🥇</Text></View>
    </View>
    <Text style={[styles.podiumName, { fontSize: 16, color: '#eab308' }]}>{top3[0]?.nome || '-'}</Text>
    <Text style={styles.podiumPoints}>{top3[0]?.pontos || 0} pts</Text>
  </View>

  {/* 3º LUGAR */}
  <View style={styles.podiumItem}>
    <View style={[styles.circlePodium, { borderColor: '#b45309', marginTop: 40 }]}>
      <View style={styles.avatarClip}>
        {renderAvatar(top3[2], 84, 30)}
      </View>
      <View style={styles.medalBronze}><Text style={{fontSize: 14}}>🥉</Text></View>
    </View>
    <Text style={styles.podiumName}>{top3[2]?.nome || '-'}</Text>
    <Text style={styles.podiumPoints}>{top3[2]?.pontos || 0} pts</Text>
  </View>
</View>

        {/* LISTA DEMAIS */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          {demais.map((item, index) => (
            <View key={index} style={styles.rankingRow}>
              <Text style={styles.rankingPos}>{index + 4}º</Text>
              
              <View style={styles.avatarContainer}>
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 12 }}>{item.nome.charAt(0)}</Text>
                )}
              </View>

              <Text style={styles.rankingNome}>{item.nome}</Text>
              <Text style={styles.rankingPts}>{item.pontos} pts</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={fetchRanking} style={styles.floatBtnUpdate}>
           <Trophy color="#fff" size={20} />
           <Text style={{ color: '#fff', fontWeight: 'bold', marginLeft: 10 }}>ATUALIZAR LISTA</Text>
        </TouchableOpacity>
        
      </ScrollView>
    </SafeAreaView>
  );
}

function SorteioScreen() {
  const [membros, setMembros] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [duplas, setDuplas] = useState([]);
  const [nomeConvidado, setNomeConvidado] = useState('');

  // Busca os nomes do banco para a lista
  useEffect(() => {
    const carregarMembros = async () => {
      const { data } = await supabase.from('membros').select('nome').order('nome');
      if (data) setMembros(data.map(m => m.nome));
    };
    carregarMembros();
  }, []);

  const toggleSelecionar = (nome) => {
    // Sempre que clicar/desclicar em alguém, limpamos o sorteio antigo
    setDuplas([]); 
    if (selecionados.includes(nome)) {
      setSelecionados(selecionados.filter(n => n !== nome));
    } else {
      setSelecionados([...selecionados, nome]);
    }
  };

  const adicionarConvidado = () => {
    if (nomeConvidado.trim() !== '') {
      setMembros(prev => [nomeConvidado, ...prev]);
      setSelecionados(prev => [nomeConvidado, ...prev]);
      setNomeConvidado('');
      setDuplas([]); // Limpa o sorteio se entrar gente nova
    }
  };

      const limparSelecao = () => {
    setSelecionados([]); // Desmarca todos os nomes
    setDuplas([]);      // Limpa qualquer sorteio que esteja na tela
  };

  const realizarSorteio = () => {
  // 1. Verifica se tem gente suficiente usando a SUA variável 'selecionados'
  if (selecionados.length < 2) {
    alert("Selecione pelo menos 2 pessoas para o sorteio!");
    return;
  }

  // 2. Embaralhar a lista original
  let lista = [...selecionados].sort(() => Math.random() - 0.5);
  let resultado = [];
  let contadorPar = 1;

  // 3. Lógica inteligente para Duplas e Trios
  // Enquanto houver pessoas na lista, a gente vai tirando
  while (lista.length > 0) {
    
    // SE SOBRAREM 3: Cria um trio e mata o sorteio
    if (lista.length === 3) {
      const trio = lista.splice(0, 3);
      resultado.push(`Trio Final: ${trio.join(' & ')}`);
    } 
    // SE TIVER 2 OU MAIS: Cria um par normal
    else if (lista.length >= 2) {
      const par = lista.splice(0, 2);
      resultado.push(`Par ${contadorPar}: ${par.join(' & ')}`);
      contadorPar++;
    } 
    // SE SOBRAR SÓ 1 (Segurança): Adiciona ao último par para virar trio
    else {
      const sobra = lista.splice(0, 1);
      if (resultado.length > 0) {
        resultado[resultado.length - 1] = resultado[resultado.length - 1].replace("Par", "Trio Final") + ` & ${sobra}`;
      } else {
        resultado.push(`Individual: ${sobra}`);
      }
    }
  }

  // 4. Salva no seu estado atual
  setDuplas(resultado);
};

  

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150}}>
        {/* Cabeçalho */}
        <View style={styles.header}>
  <Image source={require('./assets/logo_pg.png')} style={styles.logo} />
  <View style={styles.headerTexts}>
    <Text style={styles.headerTitle}>SORTEIO DE DUPLAS</Text>
    <Text style={styles.headerSub}>SELECIONE QUEM ESTÁ PRESENTE</Text>
  </View>
  {/* Adicionado a cruz aqui */}
  <Image 
    source={require('./assets/cruz.png')} 
    style={{ width: 65, height: 65, resizeMode: 'contain', marginLeft: 'auto' }} 
  />
</View>

        {/* Input de Convidado */}
        <View style={{ padding: 20, flexDirection: 'row', gap: 10 }}>
          <TextInput 
            placeholder="Nome do Convidado..." 
            placeholderTextColor="#94a3b8"
            value={nomeConvidado}
            onChangeText={setNomeConvidado}
            style={{ 
              flex: 1, backgroundColor: '#0f172a', color: '#fff', 
              borderRadius: 10, paddingHorizontal: 15, height: 50,
              borderWidth: 1, borderColor: '#1e293b'
            }}
          />
          <TouchableOpacity 
            onPress={adicionarConvidado}
            style={{ backgroundColor: '#38bdf8', width: 50, borderRadius: 10, justifyContent: 'center', alignItems: 'center' }}
          >
            <UserPlus color="#020617" size={24} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>
          <Users size={16} color="#38bdf8"/> PRESENTES HOJE ({selecionados.length})
        </Text>
        
        {/* Lista de Membros em Grade */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 15 }}>
  {membros.map((nome) => (
    <View key={nome} style={{ position: 'relative' }}>
      <TouchableOpacity 
        onPress={() => toggleSelecionar(nome)}
        style={{
          backgroundColor: selecionados.includes(nome) ? '#2563eb' : '#0f172a',
          paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20, 
          margin: 5, borderWidth: 1, borderColor: selecionados.includes(nome) ? '#38bdf8' : '#1e293b',
          flexDirection: 'row', alignItems: 'center'
        }}
      >
        <Text style={{ color: '#fff', fontSize: 13 }}>{nome}</Text>
        
        {/* Ícone para apagar o nome da lista do dia (opcional) */}
        <TouchableOpacity 
          onPress={() => {
            setMembros(prev => prev.filter(n => n !== nome));
            setSelecionados(prev => prev.filter(n => n !== nome));
          }}
          style={{ marginLeft: 8, padding: 2 }}
        >
          <Text style={{ color: '#ef4444', fontWeight: 'bold', fontSize: 16 }}>×</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </View>
  ))}
</View>

        {/* Resultado do Sorteio */}
        {duplas.length > 0 && (
          <View style={{ padding: 20, marginTop: 20, backgroundColor: '#1e293b', margin: 15, borderRadius: 15 }}>
            <Text style={{ color: '#eab308', fontWeight: 'bold', marginBottom: 15, fontSize: 16 }}>🏆 DUPLAS OU TRIO FORMADAS:</Text>
            {duplas.map((dupla, index) => (
              <View key={index} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#334155' }}>
                <Text style={{ color: '#fff', fontSize: 15 }}>
                  <Text style={{ color: '#38bdf8', fontWeight: 'bold' }}>{index + 1}º Par: </Text> {dupla}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Botão de Ação - Sortear */}
        <TouchableOpacity 
          onPress={realizarSorteio} 
          style={[
            styles.floatBtnUpdate, 
            { 
              backgroundColor: '#eab308', 
              width: '80%', 
              position: 'relative', // Garante que ele siga o fluxo da lista
              bottom: 0,            // Zera qualquer posição fixa do styles.floatBtnUpdate
              marginTop: 30, 
              marginBottom: 50,     // Margem extra para ele não colar no final do celular
              alignSelf: 'center',
              elevation: 0          // Remove sombras que podem bugar o layout no Android
            }
          ]}
        >
          <Shuffle size={24} color="#000" />
          <Text style={{ color: '#000', fontWeight: 'bold', marginLeft: 10, fontSize: 16 }}>
            SORTEAR AGORA
          </Text>
        </TouchableOpacity>

        {/* NOVO: Botão para Limpar Seleção (Só aparece se houver alguém selecionado) */}
        {selecionados.length > 0 && (
          <TouchableOpacity 
            onPress={limparSelecao}
            style={{ 
              alignSelf: 'center', 
              marginTop: 15, 
              padding: 10,
              backgroundColor: 'rgba(239, 68, 68, 0.1)', // Um fundo vermelho bem clarinho
              borderRadius: 10,
              width: '60%',
              alignItems: 'center'
            }}
          >
            <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>❌ LIMPAR SELEÇÃO ({selecionados.length})</Text>
          </TouchableOpacity>
        )}

        {/* Botão para Limpar as Duplas (Só aparece se já houver duplas) */}
        {duplas.length > 0 && (
          <TouchableOpacity 
            onPress={() => setDuplas([])}
            style={{ alignSelf: 'center', marginTop: 20, padding: 10 }}
          >
            <Text style={{ color: '#ef4444', fontWeight: 'bold', textDecorationLine: 'underline' }}>
              LIMPAR RESULTADO
            </Text>
          </TouchableOpacity>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function RegrasScreen() {
  const regras = [
    { id: '1', titulo: 'VISITANTE', pontos: '+20', cor: '#f97316', desc: 'Pontuação para quem levar um amigo novo ao PG.' },
    { id: '2', titulo: 'VOLTOU', pontos: '+10', cor: '#22c55e', desc: 'Pontuação para o visitante que retornar na semana seguinte.' },
    { id: '3', titulo: 'PRESENÇA', pontos: '+5', cor: '#3b82f6', desc: 'Pontuação padrão para todos os membros presentes no PG, nos cultos de domingos, Culto Jovem, Cultos especiais.' },
    { id: '4', titulo: 'PONTUALIDADE', pontos: '+3', cor: '#eab308', desc: 'Para quem chegar no horário combinado do início.' },
    { id: '5', titulo: 'DINÂMICA', pontos: '+2', cor: '#a855f7', desc: 'Participação ativa nas atividades e dinâmicas do dia.' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 150 }}>
        
        <View style={styles.header}>
          <Image source={require('./assets/logo_pg.png')} style={styles.logo} />
          <View style={styles.headerTexts}>
            <Text style={styles.headerTitle}>REGRAS E PONTOS</Text>
            <Text style={styles.headerSub}>SISTEMA DE PONTUAÇÃO OFICIAL</Text>
          </View>
          <Image source={require('./assets/cruz.png')} style={{ width: 65, height: 65, resizeMode: 'contain', marginLeft: 'auto' }} />
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          <Text style={[styles.sectionTitle, { marginBottom: 20 }]}>COMO FUNCIONA O RANKING?</Text>
          
          {regras.map((regra) => (
            <View key={regra.id} style={{ 
              backgroundColor: '#0f172a', 
              borderRadius: 15, 
              padding: 15, 
              marginBottom: 12, 
              borderLeftWidth: 5, 
              borderLeftColor: regra.cor,
              borderWidth: 1,
              borderColor: '#1e293b'
            }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <Text style={{ color: regra.cor, fontWeight: 'bold', fontSize: 16 }}>{regra.titulo}</Text>
                <View style={{ backgroundColor: regra.cor, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 10 }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{regra.pontos}</Text>
                </View>
              </View>
              <Text style={{ color: '#94a3b8', fontSize: 13, lineHeight: 18 }}>{regra.desc}</Text>
            </View>
          ))}

          <View style={{ marginTop: 20, backgroundColor: '#1e293b', padding: 20, borderRadius: 15 }}>
            <Text style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: 10 }}>💡 DICA DO LÍDER</Text>
            <Text style={{ color: '#fff', fontSize: 14, fontStyle: 'italic' }}>
              "O objetivo maior não são os pontos, mas o crescimento do nosso PG e o acolhimento de cada vida!"
            </Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// --- CONFIGURAÇÃO DAS ABAS ---
const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: '#020617', borderTopColor: '#1e293b', height: 70 },
          tabBarActiveTintColor: '#38bdf8',
          tabBarInactiveTintColor: '#94a3b8',
        }}
      >
        <Tab.Screen name="Chamada" component={ChamadaScreen} options={{ tabBarIcon: ({color}) => <ClipboardList color={color}/> }} />
        <Tab.Screen name="Sorteio" component={SorteioScreen} options={{ tabBarIcon: ({color}) => <Shuffle color={color}/> }} />
        <Tab.Screen name="Ranking" component={RankingScreen} options={{ tabBarIcon: ({color}) => <Trophy color={color}/> }} />
        <Tab.Screen name="Regras" component={RegrasScreen} options={{ tabBarIcon: ({color}) => <BookOpen color={color}/> }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}


const styles = StyleSheet.create({
  // --- BASE E HEADER ---
  container: { flex: 1, backgroundColor: '#020617' },
  header: { flexDirection: 'row', padding: 20, alignItems: 'center', marginTop: 10 },
  logo: { width: 70, height: 70, resizeMode: 'contain' },
  headerTexts: { marginLeft: 15 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  headerSub: { color: '#38bdf8', fontSize: 10, fontWeight: 'bold' },
  headerMission: { color: '#94a3b8', fontSize: 9 },
  sectionTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginLeft: 20, marginVertical: 15 },

  // --- TABELA DA CHAMADA (INTACTA) ---
  tableHeader: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 10 },
  colHeader: { width: 85, color: '#94a3b8', fontSize: 9, textAlign: 'center', fontWeight: 'bold' },
  col: { width: 60, color: '#94a3b8', fontSize: 10, textAlign: 'center' },
  tableRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center' },
  cell: { color: '#fff', fontSize: 13, textAlign: 'center', width: 60 },
  checkCell: { width: 85, alignItems: 'center' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#334155' },

  // --- AVATAR DA LISTA ---
  avatarContainer: { 
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#1e293b', 
    justifyContent: 'center', alignItems: 'center', marginRight: 12, 
    overflow: 'hidden', borderWidth: 1, borderColor: '#334155'
  },
  avatarImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  // --- PÓDIO DO RANKING (CORRIGIDO) ---
  podiumContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', marginVertical: 30, height: 230 },
  podiumItem: { alignItems: 'center', width: '33%' },
  
  // Esse círculo NÃO corta a medalha
  circlePodium: { 
    width: 90, 
    height: 90, 
    borderRadius: 45, 
    borderWidth: 3, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: '#0f172a',
    position: 'relative', // Permite posicionar a medalha fora
  },
  
  // Esse círculo INTERNO corta a foto
  avatarClip: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },

  podiumName: { color: '#fff', fontSize: 14, fontWeight: 'bold', marginTop: 12, textAlign: 'center' },
  podiumPoints: { color: '#38bdf8', fontSize: 13, fontWeight: 'bold', marginTop: 4 }, 

  // --- MEDALHAS (AGORA APARECEM POR FORA) ---
  medalGold: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#fff', borderRadius: 15, width: 28, height: 28, justifyContent: 'center', alignItems: 'center', elevation: 8, zIndex: 10 },
  medalSilver: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#fff', borderRadius: 15, width: 28, height: 28, justifyContent: 'center', alignItems: 'center', elevation: 8, zIndex: 10 },
  medalBronze: { position: 'absolute', bottom: -5, right: -5, backgroundColor: '#fff', borderRadius: 15, width: 28, height: 28, justifyContent: 'center', alignItems: 'center', elevation: 8, zIndex: 10 },

  // --- LISTA DO RANKING ---
  rankingRow: { 
    flexDirection: 'row', backgroundColor: '#0f172a', padding: 15, 
    borderRadius: 12, marginBottom: 10, alignItems: 'center', marginHorizontal: 20 
  },
  rankingPos: { color: '#38bdf8', fontWeight: 'bold', width: 40, fontSize: 14 },
  rankingNome: { color: '#ffffff', flex: 1, fontWeight: 'bold', fontSize: 15 },
  rankingPts: { color: '#22c55e', fontWeight: 'bold', fontSize: 14 },

  // --- BOTÕES E STATUS ---
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 20 },
  statBox: { backgroundColor: '#0f172a', width: '48%', padding: 15, borderRadius: 12, alignItems: 'center', borderLeftWidth: 3, borderLeftColor: '#38bdf8' },
  statVal: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  statLabel: { color: '#94a3b8', fontSize: 8, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 30 },
  btnSave: { backgroundColor: '#2563eb', flex: 1, height: 50, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  btnSync: { backgroundColor: '#16a34a', flex: 1, height: 50, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: 'bold', marginLeft: 10 },
  floatBtnUpdate: { position: 'absolute', bottom: 90, alignSelf: 'center', backgroundColor: '#2563eb', flexDirection: 'row', paddingHorizontal: 25, paddingVertical: 15, borderRadius: 30, elevation: 5, alignItems: 'center' }
});