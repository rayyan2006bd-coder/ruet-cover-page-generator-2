import {
  Document,
  Font,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import dayjs from 'dayjs';
import { atom, useAtomValue } from 'jotai';
import type { Store } from 'jotai/vanilla/store';
import TeXGyreTermesBold from '@/assets/fonts/TeXGyreTermes-Bold.ttf';
import TeXGyreTermes from '@/assets/fonts/TeXGyreTermes-Regular.ttf';
import motto from '@/assets/motto.png';
import RUETLogo from '@/assets/RUET-Logo.png';
import { getBestFitFontSize } from '@/lib/best-fit-font-size';
import { defaultStore } from '@/store';
import editorStore, { type Department, deptShortForm } from '@/store/editor';

Font.register({
  family: 'TeX Gyre Termes',
  fonts: [{ src: TeXGyreTermes }, { src: TeXGyreTermesBold, fontWeight: 700 }],
});

// Create styles
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    gap: 16,
    padding: '2.54cm',
    paddingLeft: '3cm',
    fontFamily: 'TeX Gyre Termes',
    textAlign: 'center',
  },
  motto: {
    position: 'absolute',
    width: '100vw',
    top: '2.54cm',
    fontSize: 12,
    color: 'transparent',
    left: 0,
  },
  institution: {
    fontSize: 17,
    marginVertical: 16,
  },
  image: {
    marginVertical: 0,
    marginHorizontal: 'auto',
    height: 104,
    width: 90,
  },
  watermark: {
    height: 416,
    width: 360,
    opacity: 0.25,
    position: 'absolute',
    left: 117.64,
    top: 212,
  },
  mottoImage: {
    marginVertical: 0,
    marginHorizontal: 'auto',
    height: 11,
    width: 122,
  },
  text: {
    fontSize: 16,
  },
  textBF: {
    fontSize: 16,
    textAlign: 'left',
    fontWeight: 700,
  },
  thV: {
    fontSize: 16,
    textAlign: 'left',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 120,
    fontWeight: 700,
  },
  thH: {
    fontSize: 16,
    textAlign: 'left',
    fontWeight: 700,
    textDecoration: 'underline',
  },
  colon: {
    fontSize: 16,
    fontWeight: 700,
    flexBasis: 16,
    textAlign: 'center',
  },
  td: {
    fontSize: 16,
    textAlign: 'left',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
  },
  tableBordered: {
    borderTop: '1px solid #000000',
    borderLeft: '1px solid #000000',
  },
  tr: { display: 'flex', flexDirection: 'row' },
  tdBordered: {
    borderBottom: '1px solid #000000',
    borderRight: '1px solid #000000',
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
  },
});

const dataListItem = (key: string, value: string, keySize?: number) => (
  <View style={{ flexDirection: 'row' }}>
    <Text style={{ ...styles.thV, flexBasis: keySize ?? styles.thV.flexBasis }}>
      {key}
    </Text>
    <Text style={styles.colon}>:</Text>
    <Text style={styles.td}>{value}</Text>
  </View>
);

const coverValuesAtom = atom((get) => ({
  department: get(editorStore.studentDepartment),
  type: get(editorStore.type),
  courseNo: get(editorStore.courseNo),
  courseTitle: get(editorStore.courseTitle),
  coverNo: get(editorStore.coverNo),
  coverTitle: get(editorStore.coverTitle),
  studentSection: get(editorStore.studentSection),
  studentID: get(editorStore.studentID),
  teacherName: get(editorStore.teacherName),
  teacherDesignation: get(editorStore.teacherDesignation),
  teacherDepartment: get(editorStore.teacherDepartment),
  dateOfSubmission: get(editorStore.dateOfSubmission),
  dateOfExperiment: get(editorStore.dateOfExperiment),
  secondTeacherName: get(editorStore.secondTeacherName),
  secondTeacherDesignation: get(editorStore.secondTeacherDesignation),
  secondTeacherDepartment: get(editorStore.secondTeacherDepartment),
  studentName: get(editorStore.studentName),
  manualSubmittedByText: get(editorStore.manualSubmittedByText),
  CO: get(editorStore.CO),
  PO: get(editorStore.PO),
  fromToBorder: get(editorStore.formToBorder),
  watermark: get(editorStore.watermark),
  courseCode: get(editorStore.courseCode),
  studentSeries: get(editorStore.studentSeries),
  studentSession: get(editorStore.studentSession),
  studentGroup: get(editorStore.studentGroup),
  courseInfoBellowTitle: get(editorStore.courseInfoBellowTitle),
  datesBellowTitle: get(editorStore.datesBellowTitle),
  manualSubmittedBy: get(editorStore.manualSubmittedBy),
  assessmentTable: get(editorStore.assessmentTable),
}));

export function getCoverValues(store: Store = defaultStore) {
  return store.get(coverValuesAtom);
}

export type CoverTemplateValues = ReturnType<typeof getCoverValues>;

// Create Document Component
export function CoverTemplate({
  store = defaultStore,
  values,
}: {
  store?: Store;
  values?: CoverTemplateValues;
} = {}) {
  const liveValues = useAtomValue(coverValuesAtom, { store });
  const {
    department,
    type,
    courseNo,
    courseTitle,
    coverNo,
    coverTitle,
    studentSection,
    studentID,
    teacherName,
    teacherDesignation,
    teacherDepartment,
    dateOfSubmission,
    dateOfExperiment,
    secondTeacherName,
    secondTeacherDesignation,
    secondTeacherDepartment,
    studentName,
    manualSubmittedByText,
    CO,
    PO,
    fromToBorder,
    watermark,
    courseCode,
    studentSeries,
    studentSession,
    studentGroup,
    courseInfoBellowTitle,
    datesBellowTitle,
    manualSubmittedBy,
    assessmentTable,
  } = values ?? liveValues;

  const teacherDept = secondTeacherName
    ? deptShortForm.get(teacherDepartment as Department)
    : teacherDepartment;
  const secondTeacherDept = secondTeacherName
    ? deptShortForm.get(secondTeacherDepartment as Department)
    : secondTeacherDepartment;

  const manualFontSize = manualSubmittedBy
    ? getBestFitFontSize({
        text: manualSubmittedByText,
        fontFamily: 'TeX Gyre Termes',
        maxHeight: 170,
        maxWidth: 230,
        minFontSize: 1,
        maxFontSize: 16,
      })
    : undefined;

  const isThesis = type === 'Thesis';

  const studentInfo = (
    <View
      style={{
        flex: '1 1 0',
        paddingRight: 16,
        borderRight: fromToBorder ? '1px solid #000000' : undefined,
        paddingHorizontal: fromToBorder ? 16 : undefined,
        paddingBottom: fromToBorder ? 8 : undefined,
      }}
    >
      <Text style={styles.thH}>Submitted by:</Text>
      {manualSubmittedBy ? (
        <Text
          style={{
            ...styles.text,
            fontSize: manualFontSize,
            lineHeight: manualFontSize && Math.max(1, manualFontSize / 12),
          }}
        >
          {manualSubmittedByText}
        </Text>
      ) : (
        <>
          <Text style={styles.text}>{studentName || '.'}</Text>
          {!!studentGroup && (
            <Text style={styles.text}>{`Group: ${studentGroup}`}</Text>
          )}
          <Text style={styles.text}>{`Roll: ${studentID}`}</Text>
          {!!studentSection && (
            <Text style={styles.text}>{`Section: ${studentSection}`}</Text>
          )}
          {!!studentSession && studentID.length >= 2 && (
            <Text style={styles.text}>
              Session: 20{studentID.slice(0, 2)}-{+studentID.slice(0, 2) + 1}
            </Text>
          )}
        </>
      )}
    </View>
  );
  const teacherInfo = (
    <View
      style={{
        flex: '1 1 0',
        paddingLeft: 16,
        borderLeft: fromToBorder ? '1px solid #000000' : undefined,
        paddingHorizontal: fromToBorder ? 16 : undefined,
        paddingBottom: fromToBorder ? 8 : undefined,
      }}
    >
      <Text style={styles.thH}>
        {isThesis ? 'Supervised by:' : 'Submitted to:'}
      </Text>
      {!!teacherName && (
        <>
          <Text style={styles.text}>{teacherName}</Text>
          <Text style={styles.text}>{teacherDesignation}</Text>
          {!!teacherDepartment && (
            <Text style={styles.text}>{`Dept. of ${teacherDept}, RUET`}</Text>
          )}
        </>
      )}
      {!!secondTeacherName && (
        <View style={{ marginTop: 16 }}>
          <Text style={styles.text}>{secondTeacherName}</Text>
          <Text style={styles.text}>{secondTeacherDesignation}</Text>
          {!!secondTeacherDepartment && (
            <Text
              style={styles.text}
            >{`Dept. of ${secondTeacherDept}, RUET`}</Text>
          )}
        </View>
      )}
    </View>
  );

  const studentTeacherTable = (
    <View
      style={{
        flexDirection: 'row',
        marginVertical: 16,
        textAlign: 'left',
        marginBottom: 'auto',
        border: fromToBorder ? '2px solid #000000' : undefined,
      }}
    >
      {isThesis ? (
        <>
          {teacherInfo}
          {studentInfo}
        </>
      ) : (
        <>
          {studentInfo}
          {teacherInfo}
        </>
      )}
    </View>
  );
  const dates = (
    <>
      {type === 'Lab Report' && (
        <View style={{ textAlign: 'left', flexDirection: 'row' }}>
          <Text style={styles.textBF}>Date of Experiment</Text>
          <Text style={styles.colon}>:</Text>
          <Text style={styles.text}>
            {dateOfExperiment && dayjs(dateOfExperiment).format('D MMMM YYYY')}
          </Text>
        </View>
      )}
      {isThesis ? (
        <View style={{ textAlign: 'center' }}>
          <Text style={styles.text}>
            {dateOfSubmission && dayjs(dateOfSubmission).format('D MMMM YYYY')}
          </Text>
        </View>
      ) : (
        <View style={{ textAlign: 'left', flexDirection: 'row' }}>
          <Text style={styles.textBF}>Date of Submission</Text>
          <Text style={styles.colon}>:</Text>
          <Text style={styles.text}>
            {dateOfSubmission && dayjs(dateOfSubmission).format('D MMMM YYYY')}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <Document title="Cover Page">
      <Page size="A4" style={styles.page}>
        {watermark && <Image src={RUETLogo} style={styles.watermark} />}
        <Text style={styles.motto}>Heaven’s Light is Our Guide</Text>
        <Image src={motto} style={styles.mottoImage} />
        <Text style={styles.institution}>
          Rajshahi University of Engineering & Technology
        </Text>
        <Image src={RUETLogo} style={styles.image} />
        <View>
          <Text style={styles.text}>{`Department of ${department}`}</Text>
          {studentSeries && studentID.length >= 2 && (
            <Text style={styles.text}>{studentID.slice(0, 2)} Series</Text>
          )}
        </View>
        {!courseInfoBellowTitle && (
          <View
            style={{
              marginVertical: !secondTeacherName ? 16 : 0,
              flexDirection: 'column',
            }}
          >
            <Text style={styles.text}>
              {`${courseCode ? 'Course Code' : 'Course No.'}: ${courseNo}`}
            </Text>
            <Text style={styles.text}>{`Course Title: ${courseTitle}`}</Text>
          </View>
        )}
        <View
          style={{
            marginVertical: !(secondTeacherName || assessmentTable)
              ? (courseInfoBellowTitle ? 16 : 0) + (datesBellowTitle ? 16 : 0)
              : 0,
          }}
        >
          {isThesis ? (
            <View style={{ textAlign: 'center' }}>
              <Text style={styles.text}>A project & thesis report on</Text>
              <Text style={styles.text}>{coverTitle}</Text>
            </View>
          ) : (
            <>
              {!!coverNo &&
                !isThesis &&
                dataListItem(
                  `${type !== 'Lab Report' ? type : 'Experiment'} No.`,
                  coverNo === '0' ? '' : coverNo.padStart(2, '0'),
                )}
              {!!coverTitle &&
                !isThesis &&
                dataListItem(
                  `${type !== 'Lab Report' ? type : 'Experiment'} Title`,
                  coverTitle,
                )}
            </>
          )}

          {courseInfoBellowTitle && (
            <>
              {dataListItem(
                courseCode ? 'Course Code' : 'Course No.',
                courseNo,
                90,
              )}
              {dataListItem('Course Title', courseTitle, 90)}
            </>
          )}
          {datesBellowTitle && dates}
        </View>
        {studentTeacherTable}
        {!datesBellowTitle && <View>{dates}</View>}
        {assessmentTable && (
          <View style={styles.tableBordered}>
            <View style={styles.tr}>
              <View style={styles.tdBordered}>
                <Text>Assessment</Text>
              </View>
            </View>
            <View style={styles.tr}>
              {['CO', 'PO', 'Mark'].map((x) => (
                <View style={styles.tdBordered} key={x}>
                  <Text>{x}</Text>
                </View>
              ))}
            </View>
            <View style={styles.tr}>
              {[CO, PO, ''].map((x, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: values might match, need index
                <View style={styles.tdBordered} key={i}>
                  <Text>{x}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}
